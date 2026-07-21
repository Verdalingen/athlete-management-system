"use client";

import { useState } from "react";
import { formatWeekday, formatShort } from "@/lib/dates";

const BAR_WIDTH = 40;
const SEGMENT_GAP = 3;
const CORNER_RADIUS = 7;

const MACRO_COLOR = {
  protein: "var(--accent)",
  carbs: "var(--cyan)",
  fat: "var(--amber)",
} as const;
const MACRO_COLOR_RGB = {
  protein: "var(--accent-rgb)",
  carbs: "var(--cyan-rgb)",
  fat: "var(--amber-rgb)",
} as const;

// Non-active bars render each macro segment muted instead of in its real
// color — matching the reference widget's discolored columns, which mix a
// flat-fill piece with a diagonally-hatched piece rather than rendering
// everything the same way. Fat/carbs (the two upper segments) go flat;
// protein (the base segment) gets the hatch texture, echoing the
// solid-on-top/hatched-on-bottom split in the reference's own bars.
const MUTED_FLAT = "var(--overlay-3)";
const MUTED_HATCH = "repeating-linear-gradient(45deg, var(--overlay-3), var(--overlay-3) 3px, var(--overlay-4) 3px, var(--overlay-4) 6px)";

export interface DayMacros {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Weekly macro breakdown — a stacked-bar dashboard tile modeled on a mobile-
 * analytics "Installs" widget Adrian referenced: a big number + colored
 * badges up top, then one stacked bar per day. Bar height is proportional to
 * that day's total calories (not grams); only the hovered day, or the
 * clicked/selected day when nothing's hovered, shows its real protein/carbs/
 * fat colors — every other bar is a muted hatched pill, same idea as the
 * reference's discolored columns. The header (calories + macro badges)
 * follows that same hover-else-selected date, mirroring how
 * FitnessTrendChart's delta badge already tracks hover-vs-latest elsewhere
 * on this dashboard. Colors reuse the exact tokens NutritionClient.tsx
 * already uses for protein/carbs/fat, so the two pages agree. */
export function WeeklyMacrosCard({ data, today }: { data: DayMacros[]; today: string }) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const activeDate = hoveredDate ?? selectedDate;
  const active = data.find(d => d.date === activeDate) ?? data[data.length - 1];

  const hasWeekData = data.some(d => d.calories > 0);
  const weekMaxCalories = Math.max(1, ...data.map(d => d.calories));

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 20, flexWrap: "wrap", flexShrink: 0 }}>
        <div>
          <div className="card-title" style={{ margin: "0 0 6px" }}>Macros</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700 }}>{Math.round(active.calories)}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dim)" }}>kcal</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--dim)" }}>
            {activeDate === today ? "Today" : `${formatWeekday(activeDate)} · ${formatShort(activeDate)}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <MacroBadge label="Protein" grams={active.protein_g} color={MACRO_COLOR.protein} colorRgb={MACRO_COLOR_RGB.protein} />
          <MacroBadge label="Carbs" grams={active.carbs_g} color={MACRO_COLOR.carbs} colorRgb={MACRO_COLOR_RGB.carbs} />
          <MacroBadge label="Fat" grams={active.fat_g} color={MACRO_COLOR.fat} colorRgb={MACRO_COLOR_RGB.fat} />
        </div>
      </div>

      {/* No grid `gap` here on purpose — a gap leaves a strip of un-covered
          space between each day's button that belongs to neither one, so
          moving the cursor through it fired onMouseLeave and snapped the
          header back to "today" before the next button's onMouseEnter
          landed. Each button now spans its full column edge-to-edge (a
          continuous hover surface across the whole row), and the narrower
          bar centered inside it is what creates the visible gap instead. */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {data.map((d) => {
          const isActive = d.date === activeDate;
          const barPct = (d.calories / weekMaxCalories) * 100;
          const proteinCal = d.protein_g * 4, carbsCal = d.carbs_g * 4, fatCal = d.fat_g * 9;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              onMouseEnter={() => setHoveredDate(d.date)}
              onMouseLeave={() => setHoveredDate(null)}
              title={`${formatWeekday(d.date)} · ${Math.round(d.calories)} kcal\nProtein ${Math.round(d.protein_g)}g · Carbs ${Math.round(d.carbs_g)}g · Fat ${Math.round(d.fat_g)}g`}
              style={{
                display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center",
                height: "100%", width: "100%", gap: 6,
                background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit",
              }}
            >
              {/* Outer frame holds the whole day's bar plus the active outline;
                  inner column-reverse + gap is what divides the three macro
                  segments apart, matching the reference's gapped pieces rather
                  than one shape split by touching colors. */}
              <div
                style={{
                  width: BAR_WIDTH, height: `${barPct}%`, minHeight: 30,
                  borderRadius: CORNER_RADIUS + SEGMENT_GAP,
                  padding: isActive ? SEGMENT_GAP : 0,
                  outline: isActive ? "2px solid var(--accent)" : "none", outlineOffset: 2,
                  display: "flex", flexDirection: "column-reverse", gap: SEGMENT_GAP,
                  transition: "outline-color .12s",
                }}
              >
                <div style={{ flex: `${proteinCal} 0 0`, minHeight: 6, width: "100%", borderRadius: CORNER_RADIUS, background: isActive ? MACRO_COLOR.protein : MUTED_HATCH }} />
                <div style={{ flex: `${carbsCal} 0 0`, minHeight: 6, width: "100%", borderRadius: CORNER_RADIUS, background: isActive ? MACRO_COLOR.carbs : MUTED_FLAT }} />
                <div style={{ flex: `${fatCal} 0 0`, minHeight: 6, width: "100%", borderRadius: CORNER_RADIUS, background: isActive ? MACRO_COLOR.fat : MUTED_FLAT }} />
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".3px", textTransform: "uppercase", color: isActive ? "var(--accent)" : "var(--dim)", flexShrink: 0 }}>
                {formatWeekday(d.date).slice(0, 3)}
              </div>
            </button>
          );
        })}
      </div>
      {!hasWeekData && (
        <div style={{ fontSize: 11, color: "var(--dim)", textAlign: "center", marginTop: 12, flexShrink: 0 }}>
          No meals logged yet this week.
        </div>
      )}
    </div>
  );
}

// Label text stays neutral (var(--dim)) rather than colored — --cyan (pearl-
// aqua, used for carbs) is documented in DESIGN.md as background/border-only,
// too light to read as text. Color-coding lives in the dot + tinted
// background instead, matching FitnessTrendChart's legend convention
// (colored swatch + plain text) rather than NutritionClient.tsx's raw
// colored-text labels.
function MacroBadge({ label, grams, color, colorRgb }: { label: string; grams: number; color: string; colorRgb: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2, minWidth: 62,
      padding: "8px 10px", borderRadius: 10, background: `rgba(${colorRgb}, .12)`,
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: ".4px", textTransform: "uppercase", color: "var(--dim)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{Math.round(grams)}<span style={{ fontSize: 10, fontWeight: 600, color: "var(--dim)" }}>g</span></span>
    </div>
  );
}
