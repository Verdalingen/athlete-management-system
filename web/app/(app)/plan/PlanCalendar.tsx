"use client";

import { useState } from "react";
import type { StrengthSession } from "@/lib/types";
import type { WeightRecommendation } from "@/lib/strength";
import { SessionDetailModal, type DayData } from "../SessionDetailModal";
import { SESSION_LABEL, SESSION_COLOR } from "@/lib/session-theme";
import { MONTH_NAMES, DAY_HEADERS, buildMonthCells, monthsInRange, type CalDay } from "@/lib/calendar";
import { estimateDurationMinutes } from "@/lib/duration";
import { formatDuration } from "@/lib/dates";

// buildMonthCells always returns a Monday-start grid padded to a multiple of
// 7, so every consecutive 7-cell chunk is exactly one calendar week (Mon-Sun)
// — reused here to roll up planned minutes per session type per week. A week
// that straddles two months is deliberately summed independently in each
// month's grid (its own partial total per month), not unified across them —
// this is a real calendar, grouped by month, so that week legitimately
// appears twice, once per month it touches.
function weekTypeTotals(
  weekCells: CalDay[],
  dayMap: Record<string, DayData>,
  strengthMap: Record<string, StrengthSession>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const cell of weekCells) {
    if (!cell.iso) continue;
    const d = dayMap[cell.iso];
    if (!d || d.is_rest) continue;
    const strength = strengthMap[cell.iso];
    const minutes = strength
      ? Math.round(strength.estimated_duration_secs / 60)
      : estimateDurationMinutes(d.description);
    if (minutes) totals[d.session_type] = (totals[d.session_type] ?? 0) + minutes;
  }
  return totals;
}

export type { DayData };

export function PlanCalendar({
  startDate,
  endDate,
  dayMap,
  strengthMap,
  today,
  bench1RMKg,
  weightRecommendations,
}: {
  startDate: string;
  endDate: string;
  dayMap: Record<string, DayData>;
  strengthMap: Record<string, StrengthSession>;
  today: string;
  bench1RMKg?: number | null;
  weightRecommendations?: Record<string, WeightRecommendation>;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const months   = monthsInRange(startDate, endDate);
  const selected = selectedDate ? dayMap[selectedDate] ?? null : null;
  const selectedStrength = selectedDate ? strengthMap[selectedDate] ?? null : null;

  function toggle(iso: string) {
    if (!dayMap[iso]) return;
    setSelectedDate(prev => prev === iso ? null : iso);
  }

  return (
    <div>

      {/* ── Calendar grid, grouped by month ── */}
      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {months.map(({ year, month }) => {
            const cells = buildMonthCells(year, month);
            return (
              <div key={`${year}-${month}`}>
                <div className="cal-month-label">{MONTH_NAMES[month]} {year}</div>
                <div className="cal-grid">
                  {DAY_HEADERS.map(h => <div key={h} className="cal-header">{h}</div>)}
                  <div className="cal-header" />
                  {Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7)).map((weekCells, w) => {
                    const totals = weekTypeTotals(weekCells, dayMap, strengthMap);
                    const types = Object.keys(totals);
                    return (
                      <div key={w} style={{ display: "contents" }}>
                        {weekCells.map((cell, i) => {
                          if (!cell.iso) return <div key={i} className="cal-day is-blank" />;
                          const d = dayMap[cell.iso];
                          const isToday    = cell.iso === today;
                          const isPast     = cell.iso < today;
                          const isSelected = cell.iso === selectedDate;
                          const cls = [
                            "cal-day",
                            d               ? "has-session"  : "",
                            d?.is_key       ? "is-key"       : "",
                            d?.is_rest      ? "is-rest"      : "",
                            d?.completedActivities?.length ? "is-completed" : "",
                            isToday         ? "is-today"     : "",
                            isPast && !isToday ? "is-past"   : "",
                          ].filter(Boolean).join(" ");

                          return (
                            <div
                              key={cell.iso}
                              className={cls}
                              onClick={() => toggle(cell.iso!)}
                              style={{
                                cursor: d ? "pointer" : "default",
                                outline: isSelected ? "2px solid var(--accent)" : undefined,
                                outlineOffset: isSelected ? "1px" : undefined,
                              }}
                            >
                              <div className={`cal-num${isToday ? " today" : ""}`}>{cell.day}</div>
                              {d && !d.is_rest && (
                                <>
                                  <div className="cal-focus">{d.focus ?? d.session_type}</div>
                                  <div className="cal-dot" style={{ background: d.completedActivities?.length ? "var(--green)" : (SESSION_COLOR[d.session_type] ?? "var(--dim)") }} />
                                </>
                              )}
                            </div>
                          );
                        })}
                        <div className="cal-week-summary">
                          {types.map(type => (
                            <span key={type} className="cal-week-summary-item">
                              <span className="cal-week-summary-dot" style={{ background: SESSION_COLOR[type] ?? "var(--dim)" }} />
                              {SESSION_LABEL[type] ?? type} {formatDuration(totals[type] * 60)}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend — derived from actual data */}
        {(() => {
          const presentTypes = [...new Set(
            Object.values(dayMap).filter(d => !d.is_rest).map(d => d.session_type)
          )];
          const hasKey = Object.values(dayMap).some(d => d.is_key);
          return (
            <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
              {presentTypes.map(type => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: SESSION_COLOR[type] ?? "var(--dim)" }} />
                  {SESSION_LABEL[type] ?? (type.charAt(0).toUpperCase() + type.slice(1))}
                </div>
              ))}
              {hasKey && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, border: "1px solid rgba(255,204,102,.50)", background: "rgba(255,204,102,.07)" }} />
                  Key session
                </div>
              )}
              {Object.values(dayMap).some(d => d.completedActivities?.length) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
                  Completed
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <SessionDetailModal day={selected} strengthSession={selectedStrength} onClose={() => setSelectedDate(null)} bench1RMKg={bench1RMKg} weightRecommendations={weightRecommendations} />
    </div>
  );
}
