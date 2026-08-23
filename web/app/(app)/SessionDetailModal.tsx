"use client";

import { formatShort, formatDuration } from "@/lib/dates";
import type { ScheduledDay, StrengthSession, CompletedActivity } from "@/lib/types";
import { formatReps, isBarbellBench, estimateBenchWeight, type WeightRecommendation } from "@/lib/strength";
import { WorkoutStructure } from "@/lib/workout-structure";
import { SESSION_LABEL, SESSION_BADGE, SESSION_COLOR } from "@/lib/session-theme";
import { formatDurationLabel } from "@/lib/duration";

export interface DayData extends ScheduledDay {
  purpose: string;
  adaptation: string;
  completedActivities?: CompletedActivity[];
}

const FULL_WEEKDAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function getWeekday(iso: string): string {
  return FULL_WEEKDAY[new Date(iso + "T12:00:00Z").getUTCDay()];
}

export function SessionDetailModal({
  day, strengthSession, onClose, bench1RMKg, weightRecommendations,
}: {
  day: DayData | null; strengthSession: StrengthSession | null; onClose: () => void;
  bench1RMKg?: number | null;
  weightRecommendations?: Record<string, WeightRecommendation>;
}) {
  if (!day) return null;

  return (
    <div
      onClick={onClose}
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
          borderLeft: `3px solid ${day.is_rest ? "transparent" : (SESSION_COLOR[day.session_type] ?? "var(--dim)")}`,
          display: "flex", flexDirection: "column", gap: 0,
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
              {getWeekday(day.date)} · {formatShort(day.date)}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
              {day.is_rest ? "Rest Day" : (day.focus ?? day.session_type)}
            </h2>
            {strengthSession?.name && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                {strengthSession.name}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", fontSize: 24, lineHeight: 1, padding: "0 0 0 16px", marginTop: -2, flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* ── What actually happened (completed Garmin activities) ── */}
        {day.completedActivities && day.completedActivities.length > 0 && (
          <div style={{ marginBottom: 16, background: "rgba(var(--green-rgb),.06)", border: "1px solid rgba(var(--green-rgb),.15)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--green)", marginBottom: 8 }}>
              What actually happened
            </div>
            {day.completedActivities.map(a => (
              <div key={a.activity_id} style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                {a.activity_name ?? a.activity_type ?? "Activity"} — {formatDuration(a.duration_secs ?? 0)}
                {a.distance_meters ? ` · ${(a.distance_meters / 1000).toFixed(1)} km` : ""}
                {a.avg_heart_rate ? ` · ${a.avg_heart_rate} bpm avg` : ""}
              </div>
            ))}
          </div>
        )}

        {!day.is_rest && (
          <>
            {/* ── Badges ── */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              <span className={SESSION_BADGE[day.session_type] ?? "badge"}>
                {SESSION_LABEL[day.session_type] ?? day.session_type}
              </span>
              {day.is_key && (
                <span className="badge badge-amber">
                  <i className="ti ti-star-filled" style={{ marginRight: 5, fontSize: 10 }} />Key session
                </span>
              )}
              {strengthSession ? (
                <span className="badge badge-blue">
                  <i className="ti ti-clock" style={{ marginRight: 4 }} />
                  {formatDuration(strengthSession.estimated_duration_secs)}
                </span>
              ) : (() => {
                const dur = formatDurationLabel(day.description);
                return dur ? (
                  <span className="badge badge-blue">
                    <i className="ti ti-clock" style={{ marginRight: 4 }} />
                    {dur}
                  </span>
                ) : null;
              })()}
              {(strengthSession?.garmin_workout_id || day.garmin_workout_id) && (
                <span className="badge badge-green">
                  <i className="ti ti-check" style={{ marginRight: 4 }} />
                  Garmin
                </span>
              )}
            </div>

            {/* ── Workout structure (non-strength only) ── */}
            {day.description && day.session_type !== "strength" && (
              <div style={{ marginBottom: 16 }}>
                <WorkoutStructure description={day.description} />
              </div>
            )}

            {/* ── Exercise table ── */}
            {strengthSession && strengthSession.exercises.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}>
                  Exercises · {strengthSession.exercises.length} movements
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th style={{ width: 64, textAlign: "center" }}>Sets × Reps</th>
                      <th style={{ width: 60, textAlign: "center" }}>Rest</th>
                      <th style={{ width: 64, textAlign: "center" }}>Intensity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strengthSession.exercises.map((ex) => {
                      const rec = weightRecommendations?.[ex.id];
                      const hasRealData = rec != null && rec.action !== "no_data" && rec.weight != null;
                      const estWeight = !hasRealData && bench1RMKg != null && isBarbellBench(ex.garmin_category, ex.display_name)
                        ? estimateBenchWeight(bench1RMKg, ex.reps_min, ex.reps_max)
                        : null;
                      return (
                      <tr key={ex.id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>{ex.display_name}</span>
                          {hasRealData && (
                            <div
                              style={{
                                fontSize: 10, marginTop: 2,
                                color: rec.action === "increase" ? "var(--green)" : rec.action === "decrease" ? "var(--red)" : "var(--dim)",
                              }}
                              title={rec.note}
                            >
                              {rec.action === "increase" ? "↑" : rec.action === "decrease" ? "↓" : "→"} {rec.weight} kg
                            </div>
                          )}
                          {estWeight != null && (
                            <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
                              ~{estWeight} kg est.
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)" }}>
                          {ex.sets}×{formatReps(ex.reps_min, ex.reps_max)}
                        </td>
                        <td style={{ textAlign: "center", fontSize: 12, color: "var(--dim)" }}>
                          {ex.rest_seconds >= 60 ? `${ex.rest_seconds / 60}m` : `${ex.rest_seconds}s`}
                        </td>
                        <td style={{ textAlign: "center", fontSize: 12, color: ex.rir === 0 ? "var(--red)" : ex.rir != null ? "var(--amber)" : "var(--dim)" }}>
                          {ex.rir === 0 ? "Failure" : ex.rir != null ? `RIR ${ex.rir}` : "–"}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Purpose & Adaptation ── */}
            {(day.purpose || day.adaptation) && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {day.purpose && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                      Purpose
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{day.purpose}</div>
                  </div>
                )}
                {day.adaptation && (
                  <div style={{ background: "rgba(var(--amber-rgb),.06)", border: "1px solid rgba(var(--amber-rgb),.15)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--amber)", marginBottom: 4 }}>
                      If you&apos;re tired
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{day.adaptation}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
