"use client";

import { useState } from "react";
import type { StrengthSession } from "@/lib/types";
import type { WeightRecommendation } from "@/lib/strength";
import { SessionDetailModal, type DayData } from "../SessionDetailModal";
import { SESSION_LABEL, SESSION_COLOR } from "@/lib/session-theme";

export type { DayData };

interface CalDay {
  iso: string | null;
  day: number | null;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_HEADERS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function buildMonthCells(year: number, month: number): CalDay[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const leadBlanks = (first.getDay() + 6) % 7;
  const cells: CalDay[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push({ iso: null, day: null });
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ iso: null, day: null });
  return cells;
}

function monthsInRange(start: string, end: string): { year: number; month: number }[] {
  const e = new Date(end);
  const months: { year: number; month: number }[] = [];
  const cur = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 1);
  while (cur <= e) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

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

      {/* ── Calendar grid ── */}
      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {months.map(({ year, month }) => {
            const cells = buildMonthCells(year, month);
            return (
              <div key={`${year}-${month}`}>
                <div className="cal-month-label">{MONTH_NAMES[month]} {year}</div>
                <div className="cal-grid">
                  {DAY_HEADERS.map(h => <div key={h} className="cal-header">{h}</div>)}
                  {cells.map((cell, i) => {
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
