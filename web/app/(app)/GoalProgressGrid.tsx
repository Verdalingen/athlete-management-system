"use client";

import { useState } from "react";
import { ExpandedChart, type RaceEvent, type TrendSeries } from "./report/ProgressTabs";

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
  const [timeframe, setTimeframe] = useState<Timeframe>("3M");

  const allDates = Array.from(new Set(charts.flatMap(c => c.series.data.map(d => d.date)))).sort();
  if (allDates.length === 0) return null;
  const cutoffMs = new Date(allDates.at(-1)!).getTime() - TF_DAYS[timeframe] * 86400000;

  const visible = charts
    .map(c => ({
      ...c,
      series: { ...c.series, data: c.series.data.filter(d => new Date(d.date).getTime() >= cutoffMs) },
    }))
    .filter(c => c.series.data.filter(d => d.value !== null).length >= 3);

  if (visible.length === 0) return null;

  return (
    <div className="card">
      <details open>
        <summary style={{ listStyle: "none", cursor: "pointer", userSelect: "none", outline: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <div className="card-title" style={{ margin: 0, flexShrink: 0 }}>Goal Progress</div>
          <span style={{ fontSize: 12, color: "var(--dim)", marginLeft: "auto" }}>
            {visible.length} goal{visible.length === 1 ? "" : "s"} tracked
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
          {visible.map(c => (
            <ExpandedChart key={c.key} series={c.series} events={events} showAnomalies={false} caption={c.caption} />
          ))}
        </div>
      </details>
    </div>
  );
}
