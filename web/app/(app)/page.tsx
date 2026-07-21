import type React from "react";
import { createServerClient, getUserId, getUserFirstName } from "@/lib/supabase-server";
import { todayISO, weekBounds, formatLong, formatShort, formatWeekday, daysBetween, mesocycleWeek, mesocycleTotalWeeks } from "@/lib/dates";
import { parseDayMeta } from "@/lib/plan-parser";
import { buildStrengthMap, getWeightRecommendation, type CompletedSetRow, type WeightRecommendation } from "@/lib/strength";
import type { CompletedActivity, Plan, ScheduledDay, StrengthSession } from "@/lib/types";
import { DashboardActions } from "./DashboardActions";
import { MiniMonthCalendar } from "./MiniMonthCalendar";
import { RecentSessionsList } from "./RecentSessionsList";
import { TodaySessionCard, TODAY_SESSION_CARD_HEIGHT } from "./TodaySessionCard";
import { WeeklyMacrosCard } from "./WeeklyMacrosCard";
import { SicknessWatchCard } from "./SicknessWatchCard";
import type { DayData } from "./SessionDetailModal";
import { FitnessTrendChart } from "./FitnessTrendChart";
import { getAthleteProfile } from "@/app/actions/athlete-profile";

function fmtTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function greeting(hour: number, name: string): string {
  const part = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${name}`;
}

// Maps a `var(--x)` color token to its `-rgb` companion for use inside rgba().
// Concatenating a hex-alpha suffix onto a var() (e.g. `${"var(--green)"}18`)
// produces an invalid CSS string the browser silently drops — found live on
// the ReadinessStrip pills and the Goals priority badge, both rendering with
// zero background/border despite the code intending a tinted chip.
const RGB_VAR: Record<string, string> = {
  "var(--green)": "var(--green-rgb)",
  "var(--cyan)": "var(--cyan-rgb)",
  "var(--amber)": "var(--amber-rgb)",
  "var(--red)": "var(--red-rgb)",
  "var(--accent)": "var(--accent-rgb)",
  "var(--blue)": "var(--blue-rgb)",
};
function rgbVar(colorToken: string): string {
  return RGB_VAR[colorToken] ?? "var(--dim-rgb, 124,138,144)";
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
  const heatmapWindowStart = new Date(Date.now() - 182 * 86400000).toISOString().slice(0, 10);
  const fitnessTrendStart = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const sicknessWindowStart = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

  // Window for the dashboard's MiniMonthCalendar (prev/current/next month, so
  // its prev/next arrows work against already-fetched data with no extra round trip).
  const todayDateObj = new Date(today + "T00:00:00");
  const calWindowStart = new Date(todayDateObj.getFullYear(), todayDateObj.getMonth() - 1, 1).toISOString().slice(0, 10);
  const calWindowEnd = new Date(todayDateObj.getFullYear(), todayDateObj.getMonth() + 2, 0).toISOString().slice(0, 10);

  const [dayRes, weekRes, weekSessRes, nextKeyRes, metricsRes, lastCheckinRes, athleteProfile, completedSetsRes, completedActivitiesRes, firstName, fitnessTrendRes, calDaysRes, calStrengthRes, weekMacrosRes, sicknessRes] = await Promise.all([
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
    sb.from("analyses").select("bench_e1rm_kg, predicted_5k_secs, kpis, report_date").eq("user_id", uid).order("report_date", { ascending: false }).limit(1),
    sb.from("replan_jobs").select("completed_at").eq("user_id", uid).eq("type", "replan").eq("status", "done").order("completed_at", { ascending: false }).limit(1),
    getAthleteProfile(),
    sb.from("completed_exercise_sets").select("exercise_id, date, reps, weight_kg, prescribed_reps_min")
      .eq("user_id", uid).gte("date", sixtyDaysAgo).order("date", { ascending: false }),
    sb.from("completed_activities").select("*").eq("user_id", uid).gte("date", heatmapWindowStart).lte("date", today),
    getUserFirstName(),
    sb.from("daily_metrics").select("date, ctl, atl").eq("user_id", uid).gte("date", fitnessTrendStart).order("date", { ascending: true }),
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).gte("date", calWindowStart).lte("date", calWindowEnd).order("date")
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("strength_sessions").select("*, exercises(*)").eq("user_id", uid).eq("plan_id", planId).gte("date", calWindowStart).lte("date", calWindowEnd)
      : Promise.resolve({ data: [] }),
    sb.from("nutrition_diary").select("date, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", uid).neq("meal_type", "water").gte("date", weekStart).lte("date", weekEnd),
    sb.from("daily_metrics").select("date, hrv_overnight, rhr, respiration_avg, sleep_stress_avg, body_battery_overnight_gain")
      .eq("user_id", uid).gte("date", sicknessWindowStart).order("date", { ascending: true }),
  ]);

  const completedActivities: CompletedActivity[] = completedActivitiesRes.data ?? [];
  const fitnessTrendData = (fitnessTrendRes.data ?? []) as { date: string; ctl: number | null; atl: number | null }[];

  const today_day: ScheduledDay | null = dayRes.data?.[0] ?? null;
  const weekDays: ScheduledDay[] = weekRes.data ?? [];
  const nextKey: ScheduledDay | null = nextKeyRes.data?.[0] ?? null;

  // Week strength sessions, for today's session card (the week range contains today).
  const weekStrengthMap: Record<string, StrengthSession> = buildStrengthMap(weekSessRes.data);
  const session: StrengthSession | null = weekStrengthMap[today] ?? null;

  // Weekly macro totals per day (Mon–Sun), for WeeklyMacrosCard — aggregated in JS
  // since Supabase JS has no GROUP BY, same pattern as /api/nutrition/trends.
  const macrosByDate = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number }>();
  for (const row of weekMacrosRes.data ?? []) {
    const existing = macrosByDate.get(row.date) ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    existing.calories += row.calories ?? 0;
    existing.protein_g += row.protein_g ?? 0;
    existing.carbs_g += row.carbs_g ?? 0;
    existing.fat_g += row.fat_g ?? 0;
    macrosByDate.set(row.date, existing);
  }
  const weeklyMacros = Array.from({ length: 7 }, (_, i) => {
    // Manually formatted (not .toISOString()) — toISOString() converts to UTC,
    // which silently shifts the date back a day in timezones ahead of UTC
    // (e.g. CEST), the same trap buildMonthCells() in lib/calendar.ts avoids.
    const date = new Date(weekStart + "T00:00:00");
    date.setDate(date.getDate() + i);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date: iso, ...(macrosByDate.get(iso) ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }) };
  });

  // Prev/current/next month of scheduled days + completed activities, for the
  // dashboard's MiniMonthCalendar — same DayData shape SessionDetailModal expects.
  const calActivityMap: Record<string, CompletedActivity[]> = {};
  for (const a of completedActivities) (calActivityMap[a.date] ??= []).push(a);
  const calDayMap: Record<string, DayData> = Object.fromEntries(
    ((calDaysRes.data ?? []) as ScheduledDay[]).map(d => {
      const meta = parseDayMeta(plan?.markdown ?? "", d.date);
      return [d.date, { ...d, purpose: meta.purpose, adaptation: meta.adaptation, completedActivities: calActivityMap[d.date] ?? [] }];
    })
  );
  const calStrengthMap: Record<string, StrengthSession> = buildStrengthMap(calStrengthRes.data);

  // Sickness watch — five signals, each compared against their own personal
  // 28-day baseline (mean ± 1 SD). No single metric alone is a reliable
  // early-illness signal, but 2+ moving off-baseline together is a real
  // pattern wearables (Whoop, Oura) lean on — see SicknessWatchCard.
  // Body Battery is scored on its overnight *recharge* (wake level minus
  // sleep-start level), not the raw end-of-day number — a single absolute
  // reading doesn't say much on its own, since it's just wherever the level
  // happened to land relative to whatever the day's activity was.
  const sicknessRows: {
    date: string;
    hrv_overnight: number | null;
    rhr: number | null;
    respiration_avg: number | null;
    sleep_stress_avg: number | null;
    body_battery_overnight_gain: number | null;
  }[] = sicknessRes.data ?? [];
  const sicknessLatest = sicknessRows[sicknessRows.length - 1] ?? null;
  const sicknessBaselineRows = sicknessRows.slice(0, -1); // exclude today so it can't skew its own baseline
  function baselineStats(values: (number | null)[]): { mean: number; std: number } | null {
    const nums = values.filter((v): v is number => v != null);
    if (nums.length < 7) return null; // not enough history for a meaningful SD
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length;
    return { mean, std: Math.sqrt(variance) };
  }
  function sicknessSignal(label: string, value: number | null, unit: string, baseline: { mean: number; std: number } | null, direction: "above" | "below") {
    const flagged = value != null && baseline != null
      ? (direction === "below" ? value < baseline.mean - baseline.std : value > baseline.mean + baseline.std)
      : false;
    return { label, value, unit, baselineMean: baseline?.mean ?? null, direction, flagged };
  }
  const sicknessSignals = [
    sicknessSignal("HRV (overnight)", sicknessLatest?.hrv_overnight ?? null, "ms", baselineStats(sicknessBaselineRows.map(r => r.hrv_overnight)), "below"),
    sicknessSignal("Resting HR", sicknessLatest?.rhr ?? null, "bpm", baselineStats(sicknessBaselineRows.map(r => r.rhr)), "above"),
    sicknessSignal("Respiration Rate", sicknessLatest?.respiration_avg ?? null, "br/min", baselineStats(sicknessBaselineRows.map(r => r.respiration_avg)), "above"),
    sicknessSignal("Sleep Stress", sicknessLatest?.sleep_stress_avg ?? null, "/100", baselineStats(sicknessBaselineRows.map(r => r.sleep_stress_avg)), "above"),
    sicknessSignal("Body Battery Recharge", sicknessLatest?.body_battery_overnight_gain ?? null, "pts", baselineStats(sicknessBaselineRows.map(r => r.body_battery_overnight_gain)), "below"),
  ];

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

      {/* ── Row 1: greeting + readiness + today's session (left column),
          month calendar + This Week stacked (right column). Stacking two
          cards on the right instead of pairing 1:1 gets the two columns'
          natural heights close enough that align-items: start reads as
          "aligned" without resorting to grid-stretch padding — see
          DESIGN.md for why forced stretch was rejected here. ── */}
      <div className="dashboard-hero-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-.5px", marginBottom: 4 }}>
              {greeting(new Date().getHours(), firstName)}
            </h1>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--dim)" }}>
              {formatLong(today)}
            </p>
          </div>

          {kpis && <ReadinessStrip kpis={kpis} />}

          {today_day ? (
            <TodaySessionCard
              today_day={today_day}
              session={session}
              dayData={calDayMap[today] ?? null}
              bench1RMKg={athleteProfile?.bench_1rm_kg}
              weightRecommendations={weightRecommendations}
            />
          ) : (
            <div className="card" style={{ height: TODAY_SESSION_CARD_HEIGHT, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%", margin: "0 auto 12px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(var(--accent-rgb), .10)",
              }}>
                <i className="ti ti-moon-stars" style={{ fontSize: 22, color: "var(--accent)" }} aria-hidden="true" />
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Rest Day</h2>
              <p style={{ color: "var(--muted)", fontSize: 14 }}>No session planned today. Recover, eat well, sleep.</p>
            </div>
          )}

          <div className="card" style={{ marginTop: 0 }}>
            <div className="card-title" style={{ margin: "0 0 12px" }}>This Week</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <MiniStat
                label="Season"
                value={meso ? <>Week {meso.week}<span style={{ fontWeight: 400, fontSize: 13, color: "var(--dim)" }}> /{meso.totalWeeks}</span></> : "No plan"}
                note={meso ? `${meso.daysLeft}d left` : undefined}
              />
              <MiniStat
                label="Next check-in"
                value={daysUntilCheckin === null ? "—" : checkinOverdue ? "Due" : `${daysUntilCheckin}d`}
                valueColor={checkinOverdue ? "var(--amber)" : undefined}
                note={
                  daysUntilCheckin === null ? undefined
                    : checkinOverdue ? (daysSinceCheckin === 0 ? "Today" : `${daysSinceCheckin}d overdue`)
                    : nextCheckinDate ? formatShort(nextCheckinDate.toISOString().slice(0, 10)) : undefined
                }
                noteColor={checkinOverdue ? "var(--amber)" : undefined}
              />
              <MiniStat
                label="This week"
                value={`${sessionCount} sessions`}
                note={keyCount > 0 ? `${keyCount} key ${keyCount === 1 ? "session" : "sessions"}` : "No key sessions"}
              />
              <MiniStat
                label="Next key"
                value={nextKey ? `${formatWeekday(nextKey.date)} · ${formatShort(nextKey.date)}` : "None upcoming"}
                note={nextKey ? (nextKey.focus ?? nextKey.session_type) : undefined}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <MiniMonthCalendar
            dayMap={calDayMap}
            strengthMap={calStrengthMap}
            today={today}
            bench1RMKg={athleteProfile?.bench_1rm_kg}
            weightRecommendations={weightRecommendations}
          />

          <WeeklyMacrosCard data={weeklyMacros} today={today} />
        </div>
      </div>

      {/* ── Row 2: fitness trend (large visual anchor) + recent sessions ──── */}
      <section className="section">
        <div className="dashboard-activity-grid">
          <FitnessTrendChart data={fitnessTrendData} />
          <RecentSessionsList activities={completedActivities} />
        </div>
      </section>

      {/* ── Sickness watch ────────────────────────────────────────────────── */}
      <section className="section">
        <SicknessWatchCard signals={sicknessSignals} />
      </section>

      {/* ── Action prompts ───────────────────────────────────────────────── */}
      <DashboardActions
        checkinOverdue={checkinOverdue}
        daysSinceCheckin={daysSinceCheckin}
        seasonEnded={seasonEnded}
        planEndDate={plan ? formatShort(plan.end_date) : ""}
      />

      {/* ── Goals ────────────────────────────────────────────────────────── */}
      {hasGoals && (
        <section className="section">
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
                        background: `rgba(${rgbVar(priorityColor)}, .12)`, color: priorityColor,
                        border: `1px solid rgba(${rgbVar(priorityColor)}, .32)`, flexShrink: 0,
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

  const acwr = kpis.training_load?.acwr_uncoupled;
  if (acwr != null) {
    const label = acwr > 1.5 ? "Danger" : acwr > 1.3 ? "High load" : acwr >= 0.8 ? "ACWR ok" : "Underload";
    const color = acwr > 1.5 ? "var(--red)" : acwr > 1.3 ? "var(--amber)" : acwr >= 0.8 ? "var(--green)" : "var(--cyan)";
    pills.push({ label, detail: `ACWR ${acwr.toFixed(2)}`, color, icon: "ti-alert-triangle" });
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
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {pills.map((p, i) => (
        <div
          key={i}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 20,
            background: `rgba(${rgbVar(p.color)}, .12)`,
            border: `1px solid rgba(${rgbVar(p.color)}, .32)`,
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

// ── This Week mini stats (borderless — sits inside a card that already has a
//    boundary, so another nested bordered box per stat would just be clutter) ──

function MiniStat({
  label, value, note, valueColor, noteColor,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  valueColor?: string;
  noteColor?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".4px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: valueColor, lineHeight: 1.2 }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: noteColor ?? "var(--muted)", marginTop: 3 }}>{note}</div>}
    </div>
  );
}

// ── KPI layout helpers ────────────────────────────────────────────────────────

function fmtRaceTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

