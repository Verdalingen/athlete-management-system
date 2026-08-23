"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/dates";
import type { ScheduledDay, StrengthSession } from "@/lib/types";
import { formatReps, isBarbellBench, estimateBenchWeight, type WeightRecommendation } from "@/lib/strength";
import { SESSION_BADGE } from "@/lib/session-theme";
import { WorkoutStructure } from "@/lib/workout-structure";
import { SessionDetailModal, type DayData } from "./SessionDetailModal";

/** Fixed height regardless of session content — a 7-exercise strength day and
 * a rest day render at the same size. Frees the hero row's overall height
 * from swinging with today's session type, which is what lets WeeklyMacrosCard
 * (flex: 1 in the right column, see DESIGN.md) claim more, consistent space
 * instead of shrinking on light session days. See DESIGN.md for the exact
 * value and how it was picked. */
export const TODAY_SESSION_CARD_HEIGHT = 380;

/** Height of the scrollable exercise-table viewport — roughly 3 rows' worth,
 * picked empirically the same way TODAY_SESSION_CARD_HEIGHT was (verify
 * against a real 7-exercise day via getBoundingClientRect, not by
 * eyeballing). Sessions with more exercises than fit scroll within this
 * fixed area instead of growing the card. */
const EXERCISE_SCROLL_HEIGHT = 172;

/** Dashboard hero card for today's session — a client component (not just markup
 * in page.tsx) because "View full session" opens the same SessionDetailModal
 * used by the calendar. Shows the same Exercise / Sets×Reps / Rest / Intensity
 * table week/page.tsx renders, inside a fixed-height scrollable viewport so
 * the card never grows past its fixed height regardless of how many
 * exercises the session has. */
export function TodaySessionCard({
  today_day, session, dayData, bench1RMKg, weightRecommendations,
}: {
  today_day: ScheduledDay;
  session: StrengthSession | null;
  dayData: DayData | null;
  bench1RMKg?: number | null;
  weightRecommendations?: Record<string, WeightRecommendation>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const exercises = session?.exercises ?? [];

  // Whether to show the "scroll for more" fade — recomputed whenever the
  // exercise list changes (a fresh scroll container starts at scrollTop 0)
  // and on every scroll so the fade disappears once the athlete reaches the
  // bottom, the same "more below" cue the other scrollable lists in this app
  // don't need since they're not inside a fixed-height card.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
  }, [exercises]);

  function handleExerciseScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
  }

  // Raw description text is redundant once WorkoutStructure's colorized zone
  // breakdown (non-strength) already represents the same content structurally
  // — matches SessionDetailModal's existing `session_type !== "strength"` rule.
  const showDescription = today_day.description && !today_day.is_rest && today_day.session_type !== "strength";
  const canViewFull = dayData != null && !today_day.is_rest;

  return (
    <>
      <div className="card" style={{ height: TODAY_SESSION_CARD_HEIGHT, display: "flex", flexDirection: "column" }}>
        <div style={{ overflow: "hidden" }}>
          {!today_day.is_rest && (
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: today_day.is_key ? "var(--accent)" : "var(--dim)", marginBottom: 6 }}>
              {today_day.session_type}{today_day.is_key ? " · Key session" : ""}
            </div>
          )}
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginBottom: 10, letterSpacing: "-.5px" }}>
            {today_day.focus ?? (today_day.is_rest ? "Rest Day" : today_day.session_type)}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!today_day.is_rest && (
              <span className={SESSION_BADGE[today_day.session_type] ?? "badge"}>
                {today_day.session_type}
              </span>
            )}
            {session && (
              <span className="badge badge-blue">{formatDuration(session.estimated_duration_secs)}</span>
            )}
          </div>

          {today_day.is_rest && (
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 14, lineHeight: 1.6 }}>
              No session planned today. Recover, eat well, sleep.
            </p>
          )}

          {showDescription && (
            <div style={{ marginTop: 14 }}>
              <WorkoutStructure description={today_day.description!} />
            </div>
          )}

          {exercises.length > 0 && (
            <div style={{ position: "relative", marginTop: 14 }}>
            <div
              ref={scrollRef}
              onScroll={handleExerciseScroll}
              className="exercise-scroll"
              style={{ maxHeight: EXERCISE_SCROLL_HEIGHT, overflowY: "auto" }}
            >
            <table>
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th style={{ width: 80, textAlign: "center" }}>Sets × Reps</th>
                  <th style={{ width: 60, textAlign: "center" }}>Rest</th>
                  <th style={{ width: 64, textAlign: "center" }}>Intensity</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map(ex => {
                  const rec = weightRecommendations?.[ex.id];
                  const hasRealData = rec != null && rec.action !== "no_data" && rec.weight != null;
                  const estWeight = !hasRealData && bench1RMKg != null && isBarbellBench(ex.garmin_category, ex.display_name)
                    ? estimateBenchWeight(bench1RMKg, ex.reps_min, ex.reps_max)
                    : null;
                  return (
                    <tr key={ex.id}>
                      <td style={{ fontWeight: 600 }}>
                        {ex.display_name}
                        {hasRealData && (
                          <div
                            style={{
                              fontSize: 10, marginTop: 2, fontWeight: 400,
                              color: rec.action === "increase" ? "var(--green)" : rec.action === "decrease" ? "var(--red)" : "var(--dim)",
                            }}
                            title={rec.note}
                          >
                            {rec.action === "increase" ? "↑" : rec.action === "decrease" ? "↓" : "→"} {rec.weight} kg
                          </div>
                        )}
                        {estWeight != null && (
                          <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 400, marginTop: 2 }}>
                            ~{estWeight} kg est.
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 12 }}>
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
            {hasMoreBelow && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute", left: 0, right: 0, bottom: 0, height: 28,
                  background: "linear-gradient(to bottom, transparent, var(--surface))",
                  display: "flex", alignItems: "flex-end", justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <i className="ti ti-chevron-down" style={{ fontSize: 12, color: "var(--dim)", marginBottom: 2 }} />
              </div>
            )}
            </div>
          )}
        </div>

        {canViewFull && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              marginTop: "auto", paddingTop: 14, flexShrink: 0, alignSelf: "flex-start",
              background: "none", border: "none", cursor: "pointer", font: "inherit",
              color: "var(--accent)", fontWeight: 700, fontSize: 12,
            }}
          >
            View full session
            <i className="ti ti-chevron-right" style={{ marginLeft: 4, fontSize: 11 }} aria-hidden="true" />
          </button>
        )}
      </div>

      {dayData && (
        <SessionDetailModal
          day={expanded ? dayData : null}
          strengthSession={session}
          onClose={() => setExpanded(false)}
          bench1RMKg={bench1RMKg}
          weightRecommendations={weightRecommendations}
        />
      )}
    </>
  );
}
