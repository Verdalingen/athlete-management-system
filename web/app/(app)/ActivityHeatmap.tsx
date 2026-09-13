"use client";

import { useState } from "react";
import type { CompletedActivity } from "@/lib/types";
import { monthNames, dayHeaders, buildMonthCells } from "@/lib/calendar";
import { useLanguage, useT } from "@/lib/i18n/LanguageContext";

type DayType = "strength" | "run" | "other" | null;

/** activity_training_load is nullable for some Garmin activity types (no per-type
 * fallback documented upstream) — count the day as "some load happened" rather than
 * showing a false gap when an activity exists but its load wasn't computed. */
const UNKNOWN_LOAD_FALLBACK = 30;

const STRENGTH_TYPES = new Set(["strength_training", "fitness_equipment"]);

function dominantType(types: Set<string | null>): DayType {
  if (types.size === 0) return null;
  // Strength days take priority when mixed (this athlete's split is bench-every-session,
  // so a strength+run day is common and strength is the more programmatically deliberate one).
  for (const t of types) if (t && STRENGTH_TYPES.has(t)) return "strength";
  for (const t of types) if (t === "running") return "run";
  return "other";
}

const TYPE_COLOR: Record<Exclude<DayType, null>, string> = {
  strength: "var(--ink)",
  run: "var(--accent)",
  other: "var(--teal)",
};
const EMPTY_COLOR = "var(--overlay-4)";
const CELL = 16, GAP = 4;

/** Progress page's training-consistency view — grouped by calendar month
 * (each month rendered as its own proper Mon–Sun grid, reusing the same
 * buildMonthCells the other calendar components use, instead of a continuous
 * GitHub-style week-column strip). Shows the current + previous month by
 * default; "Show more" reveals up to a year back, all from data already
 * fetched server-side — no extra round trip. */
export function ActivityHeatmap({ activities }: { activities: CompletedActivity[] }) {
  const t = useT().dashboard.activityHeatmap;
  const [language] = useLanguage();
  const MONTH_NAMES = monthNames(language);
  const DAY_HEADERS = dayHeaders(language);
  const [expanded, setExpanded] = useState(false);

  const byDate = new Map<string, { value: number; count: number; types: Set<string | null> }>();
  for (const a of activities) {
    const load = a.activity_training_load ?? UNKNOWN_LOAD_FALLBACK;
    const cur = byDate.get(a.date) ?? { value: 0, count: 0, types: new Set<string | null>() };
    cur.value += load;
    cur.count += 1;
    cur.types.add(a.activity_type);
    byDate.set(a.date, cur);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayDate = new Date();
  const allMonths: { year: number; month: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 1);
    allMonths.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  const visibleMonths = expanded ? allMonths : allMonths.slice(0, 2);

  // Opacity buckets computed across all loaded history (not just visible months)
  // so the shade scale stays stable as more months are revealed.
  const allValues = [...byDate.values()].map(v => v.value).filter(v => v > 0).sort((a, b) => a - b);
  const q = (p: number) => allValues.length ? allValues[Math.min(allValues.length - 1, Math.floor(p * allValues.length))] : 0;
  const q33 = q(0.33), q66 = q(0.66);
  function opacityFor(value: number): number {
    if (value <= 0) return 0;
    if (value <= q33) return 0.45;
    if (value <= q66) return 0.7;
    return 1;
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>{t.title}</div>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 11, fontWeight: 700, color: "var(--accent)",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {expanded ? t.showLess : t.showMore}
          <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 13 }} aria-hidden="true" />
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {visibleMonths.map(({ year, month }) => {
          const cells = buildMonthCells(year, month);
          return (
            <div key={`${year}-${month}`}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>
                {MONTH_NAMES[month]} {year}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${CELL}px)`, gap: GAP }}>
                {DAY_HEADERS.map(h => (
                  <div key={h} style={{ fontSize: 8, fontWeight: 700, color: "var(--dim)", textAlign: "center" }}>{h[0]}</div>
                ))}
                {cells.map((cell, i) => {
                  if (!cell.iso) return <div key={i} style={{ width: CELL, height: CELL }} />;
                  if (cell.iso > todayIso) return <div key={cell.iso} style={{ width: CELL, height: CELL }} />;
                  const entry = byDate.get(cell.iso);
                  const type = entry ? dominantType(entry.types) : null;
                  return (
                    <div
                      key={cell.iso}
                      title={`${cell.iso} · ${(entry?.count === 1 ? t.tooltipSession : t.tooltipSessions).replace("{count}", String(entry?.count ?? 0))}${type ? ` · ${type}` : ""}`}
                      style={{
                        width: CELL, height: CELL, borderRadius: 3,
                        background: type ? TYPE_COLOR[type] : EMPTY_COLOR,
                        opacity: type ? opacityFor(entry!.value) : 1,
                        outline: cell.iso === todayIso ? "1.5px solid var(--accent)" : "none",
                        outlineOffset: 1,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, fontSize: 11, color: "var(--muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLOR.strength, display: "inline-block" }} /> {t.strength}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLOR.run, display: "inline-block" }} /> {t.run}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLOR.other, display: "inline-block" }} /> {t.other}
        </span>
        <span style={{ color: "var(--dim)", marginLeft: "auto" }}>{t.shadeNote}</span>
      </div>
    </div>
  );
}
