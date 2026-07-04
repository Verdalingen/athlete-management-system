"use client";

import { useEffect, useState } from "react";

type DayData = {
  date: string; calories: number; protein_g: number; carbs_g: number; fat_g: number;
  target_calories: number | null; target_protein_g: number | null;
};

type Props = {
  selectedDate: string;
  onDateSelect: (date: string) => void;
};

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const OUTER_R = 26;
const INNER_R = 18;
const OUTER_C = 2 * Math.PI * OUTER_R;
const INNER_C = 2 * Math.PI * INNER_R;

const OVER_TOLERANCE = 1.15; // above this ratio, calories count as "over" — red ring + exact overshoot badge
const UNDER_AMBER = 0.85;    // below this (but >= UNDER_RED), calories count as moderately under — amber
const UNDER_RED = 0.7;       // below this, well under — red partial arc (no badge; shape alone reads as "way short")

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function calRingColor(ratio: number): string {
  if (ratio > OVER_TOLERANCE) return "var(--red)";
  if (ratio >= UNDER_AMBER) return "var(--green)";
  if (ratio >= UNDER_RED) return "var(--amber)";
  return "var(--red)";
}

function fmtCal(cal: number): string {
  return cal >= 1000 ? `${(cal / 1000).toFixed(1)}k` : `${Math.round(cal)}`;
}

export function WeekStrip({ selectedDate, onDateSelect }: Props) {
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({});

  useEffect(() => {
    fetch("/api/nutrition/trends?days=7")
      .then(r => r.json())
      .then(({ days }: { days?: DayData[] }) => {
        const m: Record<string, DayData> = {};
        for (const d of days ?? []) m[d.date] = d;
        setDayMap(m);
      })
      .catch(() => {});
  }, [selectedDate]); // Re-fetch when user navigates (picks up newly logged food)

  const today = todayStr();

  // Always show the 7 days ending today
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const dateStr = d.toISOString().split("T")[0];
    const data = dayMap[dateStr];
    const cal = data?.calories ?? 0;
    const protein = data?.protein_g ?? 0;
    return {
      dateStr,
      letter: DAY_LETTERS[d.getDay()],
      num: d.getDate(),
      cal,
      protein,
      // Each day's own target — a hard/easy/rest day can legitimately have a different
      // calorie/protein target, so this must never be the currently-selected day's target.
      calTarget: data?.target_calories ?? 0,
      proteinTarget: data?.target_protein_g ?? 0,
      isFuture: dateStr > today,
      isToday: dateStr === today,
      isSelected: dateStr === selectedDate,
    };
  });

  return (
    <div style={{
      background: "rgba(255,255,255,.025)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "10px 12px 8px", marginBottom: 18,
    }}>
      <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
        {cols.map(col => {
          const hasCal = !col.isFuture && col.cal > 0;
          const hasProtein = !col.isFuture && col.protein > 0;
          const calRatio = col.calTarget > 0 ? col.cal / col.calTarget : 0;
          const proteinRatio = col.proteinTarget > 0 ? col.protein / col.proteinTarget : 0;
          const calFill = hasCal ? Math.min(calRatio, 1) : 0;
          const proteinFill = hasProtein ? Math.min(proteinRatio, 1) : 0;
          const calColor = hasCal && col.calTarget > 0 ? calRingColor(calRatio) : "var(--accent)";
          const overshootPct = hasCal && col.calTarget > 0 && calRatio > OVER_TOLERANCE
            ? Math.round((calRatio - 1) * 100)
            : null;

          return (
            <button
              key={col.dateStr}
              onClick={() => onDateSelect(col.dateStr)}
              disabled={col.isFuture}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                gap: 4, background: "none", border: "none", cursor: col.isFuture ? "default" : "pointer",
                borderRadius: 8, padding: "4px 2px",
                outline: col.isSelected ? `2px solid var(--accent)` : "none",
                outlineOffset: 1,
              }}
            >
              {/* Day letter */}
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
                color: col.isToday ? "var(--accent)" : "var(--dim)",
              }}>
                {col.letter}
              </span>

              {/* Dual ring — calories outer, protein inner, date number in the middle */}
              <div style={{ position: "relative", width: 46, height: 46 }}>
                <svg viewBox="0 0 60 60" width="46" height="46">
                  <circle cx="30" cy="30" r={OUTER_R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
                  <circle
                    cx="30" cy="30" r={OUTER_R} fill="none" stroke={calColor} strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={OUTER_C} strokeDashoffset={OUTER_C * (1 - calFill)}
                    transform="rotate(-90 30 30)" style={{ transition: "stroke-dashoffset .3s ease" }}
                  />
                  <circle cx="30" cy="30" r={INNER_R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
                  <circle
                    cx="30" cy="30" r={INNER_R} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={INNER_C} strokeDashoffset={INNER_C * (1 - proteinFill)}
                    transform="rotate(-90 30 30)" style={{ transition: "stroke-dashoffset .3s ease" }}
                  />
                  <text x="30" y="34" textAnchor="middle" fontSize="11" fontWeight="600" fill={col.isToday ? "var(--accent)" : "var(--muted)"}>
                    {col.num}
                  </text>
                </svg>
                {overshootPct !== null && (
                  <span style={{
                    position: "absolute", top: -4, right: -8, background: "var(--red)", color: "#501313",
                    fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 8, whiteSpace: "nowrap",
                  }}>
                    +{overshootPct}%
                  </span>
                )}
              </div>

              {/* Numeric labels — always visible, no hover required */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: hasCal ? (col.isSelected ? "var(--text)" : "var(--dim)") : "rgba(255,255,255,.2)",
                }}>
                  {hasCal ? fmtCal(col.cal) : "—"}
                </span>
                <span style={{
                  fontSize: 8, fontWeight: 600,
                  color: hasProtein ? "var(--accent)" : "rgba(255,255,255,.2)",
                }}>
                  {hasProtein ? `${Math.round(col.protein)}g` : "—"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8, paddingTop: 7, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
        <LegendDot color="var(--green)" label="On target" />
        <LegendDot color="var(--amber)" label="Under target" />
        <LegendDot color="var(--red)" label="Off target (badge = % over)" />
        <LegendDot color="var(--accent)" label="Protein" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 6, height: 6, borderRadius: 1, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 8, color: "var(--dim)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}
