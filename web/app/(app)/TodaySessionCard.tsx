"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/dates";
import type { ScheduledDay, StrengthSession } from "@/lib/types";
import type { WeightRecommendation } from "@/lib/strength";
import { SESSION_BADGE } from "@/lib/session-theme";
import { WorkoutStructure } from "@/lib/workout-structure";
import { SessionDetailModal, type DayData } from "./SessionDetailModal";

const CHIP_LIMIT = 6;

/** Fixed height regardless of session content — a 7-exercise strength day and
 * a rest day render at the same size. Frees the hero row's overall height
 * from swinging with today's session type, which is what lets WeeklyMacrosCard
 * (flex: 1 in the right column, see DESIGN.md) claim more, consistent space
 * instead of shrinking on light session days. See DESIGN.md for the exact
 * value and how it was picked. */
export const TODAY_SESSION_CARD_HEIGHT = 380;

/** Dashboard hero card for today's session — a client component (not just markup
 * in page.tsx) because "View full session" opens the same SessionDetailModal
 * used by the calendar. Deliberately doesn't inline the exercise table or full
 * workout detail anymore (see DESIGN.md "TodaySessionCard v2" for why) — a
 * compact exercise-name chip row plus a pinned CTA is what keeps the card at a
 * fixed height across rest/run/strength days without truncating mid-table or
 * growing unboundedly. */
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

  const exercises = session?.exercises ?? [];
  const visibleExercises = exercises.slice(0, CHIP_LIMIT);
  const hiddenExerciseCount = exercises.length - visibleExercises.length;

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

          {visibleExercises.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
              {visibleExercises.map(ex => (
                <span key={ex.id} className="badge" style={{ fontWeight: 600 }}>
                  {ex.display_name}
                </span>
              ))}
              {hiddenExerciseCount > 0 && (
                <span className="badge" style={{ color: "var(--dim)" }}>+{hiddenExerciseCount} more</span>
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
