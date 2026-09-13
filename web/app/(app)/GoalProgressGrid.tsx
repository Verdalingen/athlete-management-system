"use client";

import { useState } from "react";
import { ExpandedChart, type RaceEvent, type TrendSeries } from "./report/ProgressTabs";
import { useT } from "@/lib/i18n/LanguageContext";

type Timeframe = "1M" | "3M" | "6M" | "1Y";
const TF_DAYS: Record<Timeframe, number> = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };

export interface GoalChartSpec {
  key: string;
  series: TrendSeries;
  caption?: string;
}

// One shared 1M/3M/6M/1Y toggle drives every goal-estimate chart at once (bench e1RM +
// every Garmin race-predictor distance with enough history) — a per-chart toggle would let
// each one silently show a different window, which defeats comparing "how's my form vs.
// my bench trending over the same period." All charts anchor to the same latest date
// across the whole set, not each series' own latest, so a distance with a slightly stale
// last check-in still lines up with the others instead of drifting its own window.
//
// Collapsible via native <details>, matching SicknessWatchCard's exact pattern — the
// summary line alone (title + tracked-goal count) is the "at a glance" view, no JS needed
// to show/hide the charts themselves. grid-auto-rows: 1fr forces every row to the height of
// the tallest chart in the WHOLE grid (not just its own row) — without it, a chart missing
// a caption line (Bench e1RM has no pace to show) or landing alone in the last row renders
// visibly shorter than its siblings, which is exactly the "equally sized" bug this fixes.
export function GoalProgressGrid({ charts, events }: { charts: GoalChartSpec[]; events: RaceEvent[] }) {
  const t = useT().dashboard.goalProgress;
  const [timeframe, setTimeframe] = useState<Timeframe>("3M");

  const allDates = Array.from(new Set(charts.flatMap(c => c.series.data.map(d => d.date)))).sort();
  if (allDates.length === 0) return null;
  const cutoffMs = new Date(allDates.at(-1)!).getTime() - TF_DAYS[timeframe] * 86400000;

  const windowed = charts.map(c => ({
    ...c,
    series: { ...c.series, data: c.series.data.filter(d => new Date(d.date).getTime() >= cutoffMs) },
  }));
  // A chart only reaches this component after clearing page.tsx's "has ≥3 points
  // ever" gate, so a chart with <3 points inside *this* window isn't missing data —
  // it just went quiet recently (e.g. a sync gap, or the athlete didn't run/lift
  // enough in this shorter window). Rendered below as a note rather than silently
  // dropping the goal from the grid, which otherwise looks like the goal itself
  // disappeared.
  if (windowed.length === 0) return null;

  return (
    <div className="card">
      <details open>
        <summary style={{ listStyle: "none", cursor: "pointer", userSelect: "none", outline: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <div className="card-title" style={{ margin: 0, flexShrink: 0 }}>{t.title}</div>
          <span style={{ fontSize: 12, color: "var(--dim)", marginLeft: "auto" }}>
            {(charts.length === 1 ? t.goalTracked : t.goalsTracked).replace("{count}", String(charts.length))}
          </span>
          <i className="ti ti-chevron-down" style={{ fontSize: 14, color: "var(--dim)", flexShrink: 0 }} aria-hidden="true" />
        </summary>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 2 }}>
            {(["1M", "3M", "6M", "1Y"] as const).map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)} style={{
                background: timeframe === tf ? "var(--accent)" : "none",
                border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer",
                padding: "2px 9px", fontSize: 11, fontWeight: 700,
                color: timeframe === tf ? "white" : "var(--muted)",
                transition: "background .15s, color .15s",
              }}>
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div className="goal-progress-chart-grid">
          {windowed.map(c =>
            c.series.data.filter(d => d.value !== null).length >= 3 ? (
              <ExpandedChart key={c.key} series={c.series} events={events} showAnomalies={false} caption={c.caption} />
            ) : (
              <div key={c.key} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 6, minHeight: 160, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--dim)" }}>{c.series.label}</div>
                <i className="ti ti-alert-circle" style={{ fontSize: 20, color: "var(--dim)" }} aria-hidden="true" />
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.notEnoughData.replace("{timeframe}", timeframe)}</div>
              </div>
            )
          )}
        </div>
      </details>
    </div>
  );
}
