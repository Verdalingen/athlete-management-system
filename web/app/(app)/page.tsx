import type React from "react";
import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO, weekBounds, formatLong, formatShort, formatWeekday, formatDuration, daysBetween, mesocycleWeek, mesocycleTotalWeeks } from "@/lib/dates";
import { parseDayMeta } from "@/lib/plan-parser";
import { buildStrengthMap, formatReps, getWeightRecommendation, isBarbellBench, estimateBenchWeight, type CompletedSetRow, type WeightRecommendation } from "@/lib/strength";
import { SESSION_BADGE } from "@/lib/session-theme";
import type { Plan, ScheduledDay, StrengthSession } from "@/lib/types";
import { DashboardActions } from "./DashboardActions";
import { WeekAtGlanceStrip } from "./WeekAtGlanceStrip";
import { getAthleteProfile } from "@/app/actions/athlete-profile";

function fmtTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const today = todayISO();
  const { start: weekStart, end: weekEnd } = weekBounds(today);
  const sb = createServerClient();
  const uid = await getUserId();

  const planRes = await sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1);
  const plan: Plan | null = planRes.data?.[0] ?? null;
  const planId = plan?.id ?? null;

  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const [dayRes, weekRes, weekSessRes, nextKeyRes, metricsRes, lastCheckinRes, athleteProfile, completedSetsRes] = await Promise.all([
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).eq("date", today).limit(1)
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).gte("date", weekStart).lte("date", weekEnd).order("date")
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("strength_sessions").select("*, exercises(*)").eq("user_id", uid).eq("plan_id", planId).gte("date", weekStart).lte("date", weekEnd)
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).eq("is_key", true).gt("date", today).order("date").limit(1)
      : Promise.resolve({ data: [] }),
    sb.from("analyses").select("bench_e1rm_kg, predicted_5k_secs, kpis, personal_records, report_date").eq("user_id", uid).order("report_date", { ascending: false }).limit(1),
    sb.from("replan_jobs").select("completed_at").eq("user_id", uid).eq("type", "replan").eq("status", "done").order("completed_at", { ascending: false }).limit(1),
    getAthleteProfile(),
    sb.from("completed_exercise_sets").select("exercise_id, date, reps, weight_kg, prescribed_reps_min")
      .eq("user_id", uid).gte("date", sixtyDaysAgo).order("date", { ascending: false }),
  ]);

  const today_day: ScheduledDay | null = dayRes.data?.[0] ?? null;
  const weekDays: ScheduledDay[] = weekRes.data ?? [];
  const nextKey: ScheduledDay | null = nextKeyRes.data?.[0] ?? null;

  // Week strength sessions + purpose/adaptation, for today's session card and the
  // "Week at a glance" strip's click-to-detail modal (the week range contains today).
  const weekStrengthMap: Record<string, StrengthSession> = buildStrengthMap(weekSessRes.data);
  const session: StrengthSession | null = weekStrengthMap[today] ?? null;
  const weekDayMetas = Object.fromEntries(
    weekDays.map(d => [d.date, parseDayMeta(plan?.markdown ?? "", d.date)])
  );

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

  const meso = plan
    ? {
        week: mesocycleWeek(plan.start_date, today),
        totalWeeks: mesocycleTotalWeeks(plan.start_date, plan.end_date),
        daysLeft: Math.max(0, daysBetween(today, plan.end_date)),
        pct: Math.min(100, Math.max(0, Math.round((daysBetween(plan.start_date, today) / daysBetween(plan.start_date, plan.end_date)) * 100))),
        end: plan.end_date,
      }
    : null;

  const seasonEnded = plan ? today > plan.end_date : false;

  const lastCheckinDate: Date | null = lastCheckinRes.data?.[0]?.completed_at
    ? new Date(lastCheckinRes.data[0].completed_at)
    : plan ? new Date(plan.created_at) : null;
  const nextCheckinDate = lastCheckinDate
    ? new Date(lastCheckinDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilCheckin = nextCheckinDate
    ? Math.ceil((nextCheckinDate.getTime() - Date.now()) / msPerDay)
    : null;
  const checkinOverdue = daysUntilCheckin !== null && daysUntilCheckin <= 0 && !seasonEnded;
  const daysSinceCheckin = daysUntilCheckin !== null && daysUntilCheckin < 0 ? Math.abs(daysUntilCheckin) : 0;

  const sessionCount = weekDays.filter(d => !d.is_rest).length;
  const keyCount = weekDays.filter(d => d.is_key).length;

  const latestMetrics = metricsRes.data?.[0] ?? null;
  const benchE1rm: number | null = latestMetrics?.bench_e1rm_kg ?? null;
  const predicted5kSecs: number | null = latestMetrics?.predicted_5k_secs ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpis: Record<string, any> | null = latestMetrics?.kpis ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personalRecords: Record<string, any>[] | null = latestMetrics?.personal_records ?? null;
  const kpiAsOf: string | null = kpis?.as_of ?? latestMetrics?.report_date ?? null;

  // Upcoming events from athlete profile (sorted by date, future only)
  const events = (athleteProfile?.events ?? [])
    .filter((ev: { name: string; date: string; priority: string; target_time: string }) => ev.name?.trim())
    .sort((a: { date: string }, b: { date: string }) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : 1;
    });

  const hasGoals = events.length > 0 || benchE1rm != null || predicted5kSecs != null;

  return (
    <div className="page">

      {/* ── Readiness strip ──────────────────────────────────────────────── */}
      {kpis && <ReadinessStrip kpis={kpis} />}

      {/* ── Today's date label ───────────────────────────────────────────── */}
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}>
        {formatLong(today)}
      </p>

      {/* ── Hero: Today's session ────────────────────────────────────────── */}
      <section>
        {today_day ? (
          <div className={`card ${today_day.is_key ? "card-accent" : "card-cyan"}`} style={{ borderLeftWidth: 4 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                {!today_day.is_rest && (
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: today_day.is_key ? "var(--accent)" : "var(--cyan)", marginBottom: 6 }}>
                    {today_day.session_type}{today_day.is_key ? " · Key session" : ""}
                  </div>
                )}
                <h1 style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.1, marginBottom: 8, letterSpacing: "-.5px" }}>
                  {today_day.focus ?? (today_day.is_rest ? "Rest Day" : today_day.session_type)}
                </h1>
                {today_day.description && !today_day.is_rest && (
                  <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12, lineHeight: 1.55 }}>
                    {today_day.description}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className={SESSION_BADGE[today_day.session_type] ?? "badge"}>
                    {today_day.session_type}
                  </span>
                  {session && (
                    <span className="badge badge-blue">{formatDuration(session.estimated_duration_secs)}</span>
                  )}
                </div>
              </div>
            </div>

            {session && session.exercises.length > 0 && (
              <div style={{ marginTop: 20 }}>
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
                    {session.exercises.map((ex) => {
                      const rec = weightRecommendations[ex.id];
                      const hasRealData = rec != null && rec.action !== "no_data" && rec.weight != null;
                      const estWeight = !hasRealData && athleteProfile?.bench_1rm_kg != null && isBarbellBench(ex.garmin_category, ex.display_name)
                        ? estimateBenchWeight(athleteProfile.bench_1rm_kg, ex.reps_min, ex.reps_max)
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
          </div>
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>☀️</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Rest Day</h1>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>No session planned today. Recover, eat well, sleep.</p>
          </div>
        )}
      </section>

      {/* ── Action prompts ───────────────────────────────────────────────── */}
      <DashboardActions
        checkinOverdue={checkinOverdue}
        daysSinceCheckin={daysSinceCheckin}
        seasonEnded={seasonEnded}
        planEndDate={plan ? formatShort(plan.end_date) : ""}
      />

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">Training Status</h2>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>

          <div className="kpi">
            <div className="kpi-label">Season</div>
            {meso ? (
              <>
                <div className="kpi-value">
                  Week {meso.week}<span className="kpi-unit">/ {meso.totalWeeks}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${meso.pct}%`, background: "var(--cyan)" }} />
                </div>
                <div className="kpi-note">{meso.daysLeft} days left · ends {formatShort(meso.end)}</div>
              </>
            ) : (
              <div className="kpi-value" style={{ fontSize: 14, color: "var(--dim)" }}>No plan</div>
            )}
          </div>

          <div className="kpi">
            <div className="kpi-label">Next check-in</div>
            {daysUntilCheckin === null ? (
              <div className="kpi-value" style={{ fontSize: 14, color: "var(--dim)" }}>—</div>
            ) : (() => {
              const pct = Math.min(100, Math.max(0, Math.round(((7 - daysUntilCheckin) / 7) * 100)));
              const overdue = daysUntilCheckin <= 0;
              const barColor = overdue ? "var(--amber)" : pct >= 70 ? "var(--amber)" : "var(--cyan)";
              return (
                <>
                  <div className="kpi-value" style={{ color: overdue ? "var(--amber)" : undefined }}>
                    {overdue ? "Due" : daysUntilCheckin}
                    {!overdue && <span className="kpi-unit">days</span>}
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="kpi-note" style={{ color: overdue ? "var(--amber)" : undefined }}>
                    {overdue
                      ? (daysSinceCheckin === 0 ? "Today" : `${daysSinceCheckin}d overdue`)
                      : nextCheckinDate ? formatShort(nextCheckinDate.toISOString().slice(0, 10)) : ""}
                  </div>
                </>
              );
            })()}
          </div>

          <div className="kpi">
            <div className="kpi-label">This week</div>
            <div className="kpi-value">
              {sessionCount}<span className="kpi-unit">sessions</span>
            </div>
            <div className="kpi-note">
              {keyCount > 0
                ? <span className="badge badge-accent">{keyCount} key {keyCount === 1 ? "session" : "sessions"}</span>
                : <span style={{ color: "var(--dim)" }}>No key sessions</span>
              }
            </div>
          </div>

          <div className="kpi">
            <div className="kpi-label">Next key session</div>
            {nextKey ? (
              <>
                <div className="kpi-value" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  {formatWeekday(nextKey.date)} · {formatShort(nextKey.date)}
                </div>
                <div className="kpi-note" style={{ marginTop: 6 }}>
                  {nextKey.focus ?? nextKey.session_type}
                </div>
              </>
            ) : (
              <div className="kpi-value" style={{ fontSize: 14, color: "var(--dim)" }}>None upcoming</div>
            )}
          </div>

        </div>
      </section>

      {/* ── Week at a glance ─────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">Week at a glance</h2>
        <WeekAtGlanceStrip weekDays={weekDays} strengthMap={weekStrengthMap} dayMetas={weekDayMetas} today={today} bench1RMKg={athleteProfile?.bench_1rm_kg} weightRecommendations={weightRecommendations} />
      </section>

      {/* ── Goals ────────────────────────────────────────────────────────── */}
      {hasGoals && (
        <section className="section">
          <h2 className="section-title">Goals</h2>
          <div className="goal-grid">

            {/* Event cards from athlete profile */}
            {events.map((ev: { name: string; date: string; priority: string; target_time: string }, i: number) => {
              const daysToEvent = ev.date
                ? Math.ceil((new Date(ev.date).getTime() - Date.now()) / msPerDay)
                : null;
              const isPast = daysToEvent !== null && daysToEvent < 0;
              const priorityColor =
                ev.priority === "A" ? "var(--accent)" :
                ev.priority === "B" ? "var(--amber)" :
                "var(--dim)";
              return (
                <div key={i} className="card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                    {ev.priority && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                        background: `${priorityColor}18`, color: priorityColor,
                        border: `1px solid ${priorityColor}40`, flexShrink: 0,
                      }}>
                        {ev.priority} race
                      </span>
                    )}
                    {!isPast && daysToEvent !== null && (
                      <span style={{ fontSize: 12, color: "var(--dim)", marginLeft: "auto" }}>
                        {daysToEvent === 0 ? "Today!" : daysToEvent === 1 ? "Tomorrow" : `${daysToEvent} days`}
                      </span>
                    )}
                    {isPast && <span className="badge">Completed</span>}
                  </div>
                  <div className="card-title" style={{ margin: "0 0 4px", fontSize: 15 }}>{ev.name}</div>
                  {ev.date && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                      {new Date(ev.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  )}
                  {ev.target_time && (
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "var(--dim)" }}>Target </span>
                      <span style={{ color: priorityColor, fontWeight: 700 }}>{ev.target_time}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bench press e1RM (only if from analysis data) */}
            {benchE1rm != null && (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div className="card-title" style={{ margin: 0 }}>Bench Press</div>
                  <span className="badge badge-accent" style={{ fontSize: 10 }}>est. 1RM</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="goal-current">{benchE1rm.toFixed(1)}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>kg</span>
                </div>
                {athleteProfile?.bench_1rm_kg != null && (
                  <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>
                    Profile baseline: {athleteProfile.bench_1rm_kg} kg
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>
                  Epley formula from last session&apos;s top set
                </div>
              </div>
            )}

            {/* Run predictions (5k, 10k) */}
            {predicted5kSecs != null && (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div className="card-title" style={{ margin: 0 }}>Race Predictions</div>
                  <span className="badge badge-cyan" style={{ fontSize: 10 }}>Garmin</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--dim)" }}>5 km</span>
                    <span style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{fmtRaceTime(predicted5kSecs)}</span>
                  </div>
                  {kpis?.race_predictions?.["10k_secs"] != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--dim)" }}>10 km</span>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{fmtRaceTime(kpis.race_predictions["10k_secs"])}</span>
                    </div>
                  )}
                  {kpis?.race_predictions?.half_marathon_secs != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--dim)" }}>Half marathon</span>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{fmtRaceTime(kpis.race_predictions.half_marathon_secs)}</span>
                    </div>
                  )}
                  {kpis?.race_predictions?.marathon_secs != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--dim)" }}>Marathon</span>
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{fmtRaceTime(kpis.race_predictions.marathon_secs)}</span>
                    </div>
                  )}
                </div>
                {athleteProfile?.run_5k_time && (
                  <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
                    Profile 5k: {athleteProfile.run_5k_time}
                  </div>
                )}
              </div>
            )}

          </div>
        </section>
      )}

      {/* ── Performance KPIs ─────────────────────────────────────────────── */}
      <section className="section">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Metrics</h2>
          {kpiAsOf && (
            <span style={{ fontSize: 11, color: "var(--dim)" }}>
              as of {formatShort(kpiAsOf)}
            </span>
          )}
        </div>

        {!kpis ? (
          <div className="card" style={{ color: "var(--dim)", fontSize: 13, textAlign: "center", padding: "20px" }}>
            No data yet — run the coach analysis to populate metrics.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <KpiGroup title="Training Load" defaultOpen>
              <Kpi label="Chronic Load" sub="28d avg" value={kpis.training_load?.chronic_28d_avg} />
              <Kpi label="Acute Load" sub="7d sum" value={kpis.training_load?.acute_7d_sum} />
              <Kpi label="ACWR" sub="uncoupled" value={kpis.training_load?.acwr_uncoupled} badge={acwrBadge(kpis.training_load?.acwr_uncoupled)} decimals={2} />
              <Kpi label="TSB" sub="balance" value={kpis.training_load?.tsb} badge={tsbBadge(kpis.training_load?.tsb)} signed />
              <Kpi label="Monotony" sub="7d" value={kpis.training_load?.monotony_7d} badge={monotonyBadge(kpis.training_load?.monotony_7d)} decimals={2} />
              <Kpi label="Strain" sub="7d" value={kpis.training_load?.strain_7d} decimals={0} />
              <Kpi label="Ramp Rate" sub="7d chronic Δ" value={kpis.training_load?.ramp_7d} signed decimals={1} />
            </KpiGroup>

            <KpiGroup title="Readiness" defaultOpen>
              {kpis.body_battery?.latest != null && (
                <Kpi label="Body Battery" sub="current" value={kpis.body_battery.latest} unit="%" badge={bodyBatteryBadge(kpis.body_battery.latest)} decimals={0} />
              )}
              {kpis.body_battery?.avg_7d != null && (
                <Kpi label="Body Battery" sub="7d avg" value={kpis.body_battery.avg_7d} unit="%" decimals={0} />
              )}
              {kpis.training_readiness?.score != null && (
                <Kpi label="Training Readiness" sub={kpis.training_readiness.level ?? undefined} value={kpis.training_readiness.score} badge={readinessBadge(kpis.training_readiness.score)} decimals={0} />
              )}
              <Kpi label="HRV" sub="7d avg" value={kpis.hrv?.weekly_avg} unit="ms" badge={kpis.hrv?.baseline_low != null ? hrvBadge(kpis.hrv.weekly_avg, kpis.hrv.baseline_low, kpis.hrv.baseline_high) : undefined} decimals={0} />
              <Kpi label="HRV" sub="last night" value={kpis.hrv?.last_night_avg} unit="ms" decimals={0} />
              {kpis.hrv?.baseline_low != null && (
                <Kpi label="HRV Baseline" sub="balanced range" value={`${kpis.hrv.baseline_low}–${kpis.hrv.baseline_high}`} raw />
              )}
              <Kpi label="Resting HR" sub="from Garmin" value={kpis.physiological?.rhr} unit="bpm" decimals={0} />
            </KpiGroup>

            <KpiGroup title="Sleep (7d avg)">
              <Kpi label="Total" value={kpis.sleep?.avg_total_hours} unit="h" badge={sleepBadge(kpis.sleep?.avg_total_hours)} />
              <Kpi label="Deep" value={kpis.sleep?.avg_deep_hours} unit="h" />
              <Kpi label="REM" value={kpis.sleep?.avg_rem_hours} unit="h" />
              <Kpi label="Score" value={kpis.sleep?.avg_score} unit="/100" decimals={0} />
              <Kpi label="Overnight HRV" value={kpis.sleep?.avg_overnight_hrv} unit="ms" decimals={0} />
              <Kpi label="Sleep RHR" value={kpis.sleep?.avg_rhr} unit="bpm" decimals={0} />
            </KpiGroup>

            <KpiGroup title="Performance">
              <Kpi label="VO₂max" sub="running" value={kpis.physiological?.vo2max_running} unit="ml/kg/min" />
              {kpis.physiological?.vo2max_cycling != null && (
                <Kpi label="VO₂max" sub="cycling" value={kpis.physiological.vo2max_cycling} unit="ml/kg/min" />
              )}
              {kpis.physiological?.ftp_watts != null && (
                <Kpi label="FTP" sub="cycling" value={kpis.physiological.ftp_watts} unit="W" decimals={0} />
              )}
              <Kpi label="LT Heart Rate" value={kpis.physiological?.lactate_threshold_hr} unit="bpm" decimals={0} />
              <Kpi label="LT Pace" value={kpis.physiological?.lactate_threshold_pace_min_per_km != null ? formatLTPace(kpis.physiological.lactate_threshold_pace_min_per_km) : null} unit="/km" raw />
            </KpiGroup>

            <KpiGroup title="Body">
              <Kpi label="Weight" value={kpis.body?.weight_kg} unit="kg" />
              {kpis.body?.weight_change_kg != null && (
                <Kpi label="Weight Δ" sub="this period" value={kpis.body.weight_change_kg} unit="kg" signed />
              )}
              {kpis.body?.hydration_avg_l != null && (
                <Kpi label="Hydration" sub="daily avg" value={kpis.body.hydration_avg_l} unit="L" />
              )}
            </KpiGroup>

            {(kpis.stress?.avg_7d != null || kpis.stress?.max_7d != null) && (
              <KpiGroup title="Stress (7d)">
                <Kpi label="Avg Stress" value={kpis.stress.avg_7d} unit="/100" decimals={0} />
                <Kpi label="Max Stress" value={kpis.stress.max_7d} unit="/100" decimals={0} />
              </KpiGroup>
            )}

          </div>
        )}
      </section>

      {/* ── Personal Records ─────────────────────────────────────────────── */}
      {personalRecords && personalRecords.length > 0 && (
        <section className="section">
          <h2 className="section-title">Personal Records</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th style={{ textAlign: "right" }}>Value</th>
                  <th style={{ textAlign: "right" }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {personalRecords.map((pr, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, textTransform: "capitalize" }}>
                      {formatPrType(pr.type)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>
                      {formatPrValue(pr.type, pr.value)}
                    </td>
                    <td style={{ textAlign: "right", fontSize: 12, color: "var(--dim)" }}>
                      {formatPrDate(pr.pr_start_time_local)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
            Garmin-tracked personal records · synced from Garmin Connect.
          </p>
        </section>
      )}

    </div>
  );
}

// ── Readiness strip ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReadinessStrip({ kpis }: { kpis: Record<string, any> }) {
  type Pill = { label: string; detail?: string; color: string; icon: string };
  const pills: Pill[] = [];

  const tsb = kpis.training_load?.tsb;
  if (tsb != null) {
    const label = tsb > 10 ? "Fresh" : tsb > -10 ? "Balanced" : tsb > -30 ? "Building" : "Fatigued";
    const color = tsb > 10 ? "var(--green)" : tsb > -10 ? "var(--cyan)" : tsb > -30 ? "var(--amber)" : "var(--red)";
    pills.push({ label, detail: `TSB ${tsb > 0 ? "+" : ""}${Math.round(tsb)}`, color, icon: "ti-wave-sine" });
  }

  const readiness = kpis.training_readiness?.score;
  if (readiness != null) {
    const color = readiness >= 70 ? "var(--green)" : readiness >= 40 ? "var(--amber)" : "var(--red)";
    pills.push({ label: `Ready ${Math.round(readiness)}`, color, icon: "ti-bolt" });
  }

  const bb = kpis.body_battery?.latest;
  if (bb != null) {
    const color = bb >= 60 ? "var(--green)" : bb >= 40 ? "var(--amber)" : "var(--red)";
    pills.push({ label: `Battery ${Math.round(bb)}%`, color, icon: "ti-battery-2" });
  }

  const hrv = kpis.hrv?.weekly_avg;
  const hrvLow = kpis.hrv?.baseline_low;
  const hrvHigh = kpis.hrv?.baseline_high;
  if (hrv != null && hrvLow != null && hrvHigh != null) {
    const inRange = hrv >= hrvLow && hrv <= hrvHigh;
    const color = inRange ? "var(--green)" : "var(--amber)";
    const status = inRange ? "HRV ok" : hrv < hrvLow ? "HRV low" : "HRV high";
    pills.push({ label: status, detail: `${Math.round(hrv)} ms`, color, icon: "ti-heart-rate-monitor" });
  }

  const sleep = kpis.sleep?.avg_total_hours;
  if (sleep != null) {
    const color = sleep >= 7.5 ? "var(--green)" : sleep >= 6 ? "var(--amber)" : "var(--red)";
    pills.push({ label: `Sleep ${sleep.toFixed(1)} h`, color, icon: "ti-moon" });
  }

  if (pills.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
      {pills.map((p, i) => (
        <div
          key={i}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 20,
            background: `${p.color}18`,
            border: `1px solid ${p.color}40`,
          }}
        >
          <i className={`ti ${p.icon}`} style={{ fontSize: 11, color: p.color }} aria-hidden="true" />
          <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{p.label}</span>
          {p.detail && (
            <span style={{ fontSize: 10, color: "var(--dim)" }}>· {p.detail}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── KPI layout helpers ────────────────────────────────────────────────────────

function KpiGroup({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen || undefined} style={{ borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--surface)", padding: "12px 16px" }}>
      <summary style={{
        listStyle: "none",
        cursor: "pointer",
        userSelect: "none",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "1px",
        textTransform: "uppercase",
        color: "var(--dim)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        outline: "none",
      }}>
        <i className="ti ti-chevron-right" style={{ fontSize: 10 }} aria-hidden="true" />
        {title}
      </summary>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
        {children}
      </div>
    </details>
  );
}

function Kpi({
  label, sub, value, unit, badge, signed, decimals = 1, raw,
}: {
  label: string;
  sub?: string;
  value: number | string | null | undefined;
  unit?: string;
  badge?: React.ReactNode;
  signed?: boolean;
  decimals?: number;
  raw?: boolean;
}) {
  const isEmpty = value == null;
  let display: string;
  if (raw) {
    display = value != null ? String(value) : "—";
  } else if (isEmpty) {
    display = "—";
  } else {
    const num = Number(value);
    const prefix = signed && num > 0 ? "+" : "";
    display = `${prefix}${num.toFixed(decimals)}`;
  }
  return (
    <div className="kpi">
      <div className="kpi-label">{label}{sub ? <span style={{ fontWeight: 400, color: "var(--dim)", marginLeft: 4 }}>{sub}</span> : null}</div>
      <div className="kpi-value" style={{ fontSize: isEmpty ? 14 : undefined, color: isEmpty ? "var(--dim)" : undefined }}>
        {display}
        {!isEmpty && unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {badge && <div className="kpi-note">{badge}</div>}
    </div>
  );
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function tsbBadge(tsb: number | null) {
  if (tsb == null) return null;
  if (tsb > 10)  return <span className="badge badge-green">Fresh</span>;
  if (tsb > -10) return <span className="badge badge-blue">Balanced</span>;
  if (tsb > -30) return <span className="badge badge-amber">Building</span>;
  return <span className="badge badge-red">Fatigued</span>;
}

function acwrBadge(acwr: number | null) {
  if (acwr == null) return null;
  if (acwr > 1.5)  return <span className="badge badge-red">Danger</span>;
  if (acwr > 1.3)  return <span className="badge badge-amber">High</span>;
  if (acwr >= 0.8) return <span className="badge badge-green">Optimal</span>;
  return <span className="badge badge-blue">Underload</span>;
}

function monotonyBadge(m: number | null) {
  if (m == null) return null;
  if (m > 2.0) return <span className="badge badge-amber">Monotonous</span>;
  if (m > 1.5) return <span className="badge badge-blue">Moderate</span>;
  return <span className="badge badge-green">Varied</span>;
}

function bodyBatteryBadge(v: number | null) {
  if (v == null) return null;
  if (v >= 60) return <span className="badge badge-green">Good</span>;
  if (v >= 40) return <span className="badge badge-amber">Moderate</span>;
  return <span className="badge badge-red">Depleted</span>;
}

function readinessBadge(score: number | null) {
  if (score == null) return null;
  if (score >= 70) return <span className="badge badge-green">Ready</span>;
  if (score >= 40) return <span className="badge badge-amber">Moderate</span>;
  return <span className="badge badge-red">Recover</span>;
}

function hrvBadge(hrv: number | null, low: number, high: number) {
  if (hrv == null) return null;
  if (hrv >= low && hrv <= high) return <span className="badge badge-green">Balanced</span>;
  if (hrv < low)  return <span className="badge badge-amber">Below baseline</span>;
  return <span className="badge badge-blue">Above baseline</span>;
}

function sleepBadge(hours: number | null) {
  if (hours == null) return null;
  if (hours >= 7.5) return <span className="badge badge-green">Good</span>;
  if (hours >= 6)   return <span className="badge badge-amber">Ok</span>;
  return <span className="badge badge-red">Short</span>;
}

function fmtRaceTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

function formatLTPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPrType(type: string | number | null): string {
  // Garmin's raw personal-records API returns a numeric, undocumented typeId
  // (not a descriptive string) — there's no reliable public mapping for it, so
  // rather than guess and risk mislabeling a real record, show a generic label.
  if (type == null || typeof type !== "string") return "Personal Record";
  return type
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatPrValue(type: string | number | null, value: number | null): string {
  if (value == null) return "—";
  const t = typeof type === "string" ? type.toLowerCase() : "";
  if (t.includes("time") || t.includes("duration")) {
    return fmtRaceTime(Math.round(value));
  }
  if (t.includes("distance") || t.includes("km") || t.includes("meter")) {
    return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${value} m`;
  }
  if (t.includes("speed") || t.includes("pace")) {
    return `${value.toFixed(2)} m/s`;
  }
  if (t.includes("elevation") || t.includes("ascent")) {
    return `${value.toFixed(0)} m`;
  }
  // Unknown/numeric type — unit unknown, so show a plain formatted number
  // rather than guessing units.
  return value % 1 === 0 ? value.toLocaleString() : value.toFixed(2);
}

function formatPrDate(raw: string | number | null): string {
  // Garmin returns this as an epoch-ms number for some record types and an
  // ISO string for others — normalize both through Date before formatting.
  if (raw == null) return "—";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return "—";
  return formatShort(date.toISOString().slice(0, 10));
}
