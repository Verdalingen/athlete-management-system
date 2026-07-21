import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO, weekBounds, formatShort, formatDuration } from "@/lib/dates";
import { parseWeekGoals, parseDayMeta, currentWeekGoal } from "@/lib/plan-parser";
import { buildStrengthMap, formatReps, isBarbellBench, estimateBenchWeight, getWeightRecommendation, type CompletedSetRow, type WeightRecommendation } from "@/lib/strength";
import { SESSION_COLOR, SESSION_BADGE } from "@/lib/session-theme";
import type { ScheduledDay, StrengthSession, Plan } from "@/lib/types";
import { WorkoutStructure } from "@/lib/workout-structure";
import { getAthleteProfile } from "@/app/actions/athlete-profile";

const FULL_WEEKDAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function fullDate(iso: string, isToday: boolean): string {
  const d = new Date(iso + "T12:00:00Z");
  const wd = FULL_WEEKDAY[d.getUTCDay()];
  return isToday ? `${wd} · Today` : wd;
}

export default async function WeekPage() {
  const today = todayISO();
  const { start, end } = weekBounds(today);
  const sb = createServerClient();
  const uid = await getUserId();

  const planRes = await sb.from("plans").select("*").eq("user_id", uid)
    .order("created_at", { ascending: false }).limit(1);
  const plan: Plan | null = planRes.data?.[0] ?? null;
  const planId = plan?.id ?? null;

  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const [daysRes, sessionsRes, athleteProfile, completedSetsRes] = await Promise.all([
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId)
          .gte("date", start).lte("date", end).order("date")
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("strength_sessions").select("*, exercises(*)").eq("user_id", uid).eq("plan_id", planId)
          .gte("date", start).lte("date", end).order("date")
      : Promise.resolve({ data: [] }),
    getAthleteProfile(),
    sb.from("completed_exercise_sets").select("exercise_id, date, reps, weight_kg, prescribed_reps_min")
      .eq("user_id", uid).gte("date", sixtyDaysAgo).order("date", { ascending: false }),
  ]);
  const bench1RMKg = athleteProfile?.bench_1rm_kg;

  const days: ScheduledDay[] = daysRes.data ?? [];

  // Map date → strength session
  const sessionMap: Record<string, StrengthSession> = buildStrengthMap(sessionsRes.data);

  // Weight recommendation per exercise_id, from actual completed performance history —
  // supersedes the 1RM-formula estimate wherever real data exists for that specific exercise.
  const completedSetsByExercise = new Map<string, CompletedSetRow[]>();
  for (const row of completedSetsRes.data ?? []) {
    if (!row.exercise_id) continue;
    if (!completedSetsByExercise.has(row.exercise_id)) completedSetsByExercise.set(row.exercise_id, []);
    completedSetsByExercise.get(row.exercise_id)!.push({
      date: row.date, reps: row.reps, weight_kg: row.weight_kg, prescribed_reps_min: row.prescribed_reps_min,
    });
  }
  const weightRecommendations: Record<string, WeightRecommendation> = {};
  for (const [exerciseId, sets] of completedSetsByExercise) {
    weightRecommendations[exerciseId] = getWeightRecommendation(sets);
  }

  // Parse week goal and per-day PURPOSE/ADAPTATION from markdown
  const md = plan?.markdown ?? "";
  const weekGoals = parseWeekGoals(md);
  const weekGoal = plan ? currentWeekGoal(weekGoals, plan.start_date, start) : null;
  const dayMetas = Object.fromEntries(
    days.map(d => [d.date, parseDayMeta(md, d.date)])
  );

  // Week stats
  const trainingDays = days.filter(d => !d.is_rest);
  const keyDays = days.filter(d => d.is_key);
  const totalSecs = Object.values(sessionMap).reduce((s, ss) => s + ss.estimated_duration_secs, 0);

  if (!days.length) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
          No plan found for this week.
        </div>
      </div>
    );
  }

  return (
    <div className="page">

      {/* ── Week header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
          {formatShort(start)} – {formatShort(end)}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          {trainingDays.length} training {trainingDays.length === 1 ? "day" : "days"}
          {keyDays.length > 0 && ` · ${keyDays.length} key`}
          {totalSecs > 0 && ` · ${formatDuration(totalSecs)} strength`}
        </p>
      </div>

      {/* ── Week goal banner ── */}
      {weekGoal && (
        <div className="card card-accent" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 6 }}>
            {weekGoal.heading.split("(")[0].trim()} · {weekGoal.phase}
          </div>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{weekGoal.goal}</p>
        </div>
      )}

      {/* ── Day agenda ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {days.map(d => {
          const isToday = d.date === today;
          const isPast = d.date < today;
          const session = sessionMap[d.date];
          const meta = dayMetas[d.date];
          const accentColor = SESSION_COLOR[d.session_type] ?? "var(--dim)";

          return (
            <div
              key={d.id}
              className="card"
              style={{
                borderLeft: `3px solid ${d.is_rest ? "transparent" : accentColor}`,
                opacity: isPast && !isToday ? 0.65 : 1,
                borderColor: isToday ? "var(--cyan)" : undefined,
              }}
            >
              {/* ── Header ── */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: d.is_rest ? 0 : 14, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase", color: isToday ? "var(--cyan)" : "var(--dim)", marginBottom: 4 }}>
                    {fullDate(d.date, isToday)} · {formatShort(d.date)}
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
                    {d.is_rest ? "Rest Day" : (d.focus ?? d.session_type)}
                  </h2>
                  {session?.name && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{session.name}</div>
                  )}
                </div>

                {/* Badges */}
                {!d.is_rest && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                    <span className={SESSION_BADGE[d.session_type] ?? "badge"}>{d.session_type}</span>
                    {d.is_key && (
                      <span className="badge badge-amber">
                        <i className="ti ti-star-filled" style={{ marginRight: 5, fontSize: 10 }} />Key session
                      </span>
                    )}
                    {session && (
                      <span className="badge badge-blue">
                        <i className="ti ti-clock" style={{ marginRight: 4 }} />
                        {formatDuration(session.estimated_duration_secs)}
                      </span>
                    )}
                    {session?.garmin_workout_id && (
                      <span className="badge badge-green">
                        <i className="ti ti-check" style={{ marginRight: 4 }} />
                        Garmin
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Workout structure (non-strength only) ── */}
              {!d.is_rest && d.session_type !== "strength" && d.description && (
                <div style={{ marginBottom: 14 }}>
                  <WorkoutStructure description={d.description} />
                </div>
              )}

              {/* ── Exercise table ── */}
              {session && session.exercises.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}>
                    Exercises · {session.exercises.length} movements
                  </div>
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
                      {session.exercises.map(ex => {
                        const rec = weightRecommendations[ex.id];
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
              )}

              {/* ── Purpose & Adaptation ── */}
              {!d.is_rest && (meta.purpose || meta.adaptation) && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  {meta.purpose && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                        Purpose
                      </div>
                      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{meta.purpose}</div>
                    </div>
                  )}
                  {meta.adaptation && (
                    <div style={{ background: "rgba(var(--amber-rgb),.06)", border: "1px solid rgba(var(--amber-rgb),.15)", borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--amber)", marginBottom: 4 }}>
                        If you&apos;re tired
                      </div>
                      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{meta.adaptation}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
