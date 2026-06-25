"use client";

import { useState } from "react";
import { formatShort, formatDuration } from "@/lib/dates";
import type { ScheduledDay, StrengthSession } from "@/lib/types";
import { WorkoutStructure } from "@/lib/workout-structure";

export interface DayData extends ScheduledDay {
  purpose: string;
  adaptation: string;
}

interface CalDay {
  iso: string | null;
  day: number | null;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_HEADERS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const FULL_WEEKDAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const SESSION_COLOR: Record<string, string> = {
  strength: "var(--accent)",
  run:      "var(--cyan)",
  race:     "var(--red)",
  cross:    "var(--amber)",
  rest:     "var(--dim)",
};

const SESSION_LABEL: Record<string, string> = {
  strength: "Strength",
  run:      "Run",
  race:     "Race",
  cross:    "Cross-train",
};

const TYPE_BADGE: Record<string, string> = {
  strength: "badge badge-accent",
  run:      "badge badge-cyan",
  race:     "badge badge-red",
  cross:    "badge badge-amber",
};

const TYPE_COLOR: Record<string, string> = {
  strength: "var(--accent)",
  run:      "var(--cyan)",
  race:     "var(--red)",
  cross:    "var(--amber)",
};

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

function getWeekday(iso: string): string {
  return FULL_WEEKDAY[new Date(iso + "T12:00:00Z").getUTCDay()];
}


export function PlanCalendar({
  startDate,
  endDate,
  dayMap,
  strengthMap,
  today,
}: {
  startDate: string;
  endDate: string;
  dayMap: Record<string, DayData>;
  strengthMap: Record<string, StrengthSession>;
  today: string;
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
                      d               ? "has-session" : "",
                      d?.is_key       ? "is-key"      : "",
                      d?.is_rest      ? "is-rest"     : "",
                      isToday         ? "is-today"    : "",
                      isPast && !isToday ? "is-past"  : "",
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
                            <div className="cal-dot" style={{ background: SESSION_COLOR[d.session_type] ?? "var(--dim)" }} />
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
                  <div style={{ width: 8, height: 8, borderRadius: 2, border: "1px solid rgba(124,92,255,.5)", background: "rgba(124,92,255,.1)" }} />
                  Key session
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Modal overlay ── */}
      {selected && (
        <div
          onClick={() => setSelectedDate(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 16px",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{
              width: "100%", maxWidth: 580,
              maxHeight: "85vh", overflowY: "auto",
              borderLeft: `3px solid ${selected.is_rest ? "transparent" : (TYPE_COLOR[selected.session_type] ?? "var(--dim)")}`,
              display: "flex", flexDirection: "column", gap: 0,
            }}
          >
            {/* ── Header ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                  {getWeekday(selected.date)} · {formatShort(selected.date)}
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
                  {selected.is_rest ? "Rest Day" : (selected.focus ?? selected.session_type)}
                </h2>
                {selectedStrength?.name && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                    {selectedStrength.name}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                aria-label="Close"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", fontSize: 24, lineHeight: 1, padding: "0 0 0 16px", marginTop: -2, flexShrink: 0 }}
              >
                ×
              </button>
            </div>

            {!selected.is_rest && (
              <>
                {/* ── Badges ── */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  <span className={TYPE_BADGE[selected.session_type] ?? "badge"}>
                    {SESSION_LABEL[selected.session_type] ?? selected.session_type}
                  </span>
                  {selected.is_key && <span className="badge badge-accent">Key session</span>}
                  {selectedStrength && (
                    <span className="badge badge-blue">
                      <i className="ti ti-clock" style={{ marginRight: 4 }} />
                      {formatDuration(selectedStrength.estimated_duration_secs)}
                    </span>
                  )}
                  {selectedStrength?.garmin_workout_id && (
                    <span className="badge badge-green">
                      <i className="ti ti-check" style={{ marginRight: 4 }} />
                      Garmin
                    </span>
                  )}
                </div>

                {/* ── Workout description ── */}
                {selected.description && (
                  <div style={{ marginBottom: 16 }}>
                    <WorkoutStructure description={selected.description} />
                  </div>
                )}

                {/* ── Exercise table ── */}
                {selectedStrength && selectedStrength.exercises.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}>
                      Exercises · {selectedStrength.exercises.length} movements
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Exercise</th>
                          <th style={{ width: 64, textAlign: "center" }}>Sets × Reps</th>
                          <th style={{ width: 60, textAlign: "center" }}>Rest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStrength.exercises.map((ex, i) => (
                          <tr key={ex.id}>
                            <td>
                              <span style={{ fontWeight: 600 }}>{ex.display_name}</span>
                            </td>
                            <td style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)" }}>
                              {ex.sets}×{ex.reps}
                            </td>
                            <td style={{ textAlign: "center", fontSize: 12, color: "var(--dim)" }}>
                              {ex.rest_seconds >= 60 ? `${ex.rest_seconds / 60}m` : `${ex.rest_seconds}s`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── Purpose & Adaptation ── */}
                {(selected.purpose || selected.adaptation) && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    {selected.purpose && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                          Purpose
                        </div>
                        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{selected.purpose}</div>
                      </div>
                    )}
                    {selected.adaptation && (
                      <div style={{ background: "rgba(255,180,0,.06)", border: "1px solid rgba(255,180,0,.15)", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--amber)", marginBottom: 4 }}>
                          If you&apos;re tired
                        </div>
                        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{selected.adaptation}</div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
