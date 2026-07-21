import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO, formatShort } from "@/lib/dates";
import { parseWeekGoals, parseDayMeta } from "@/lib/plan-parser";
import { buildStrengthMap, getWeightRecommendation, type CompletedSetRow, type WeightRecommendation } from "@/lib/strength";
import type { Plan, ScheduledDay, StrengthSession, CompletedActivity } from "@/lib/types";
import { PlanCalendar } from "./PlanCalendar";
import type { DayData } from "./PlanCalendar";
import { ReplanPanel } from "./ReplanPanel";
import { getReplanJobs } from "@/app/actions/replan";
import { getAthleteProfile } from "@/app/actions/athlete-profile";

// ── Markdown parsers ──────────────────────────────────────────────────────────

interface PlanMeta {
  title: string;
  phase: string;
  chronicLoad: string;
  target: string;
  totalDays: number;
  totalWeeks: number;
}

import type { WeekGoal } from "@/lib/plan-parser";

function parseMeta(md: string, start: string, end: string): PlanMeta {
  const titleMatch   = md.match(/^#\s+(.+)$/m);
  const phaseMatch   = md.match(/\*\*Phase:\*\*\s*([^\n|]+)/);
  const chronicMatch = md.match(/\*\*Chronic Load Entry:\*\*\s*([^\n|]+)/);
  const targetMatch  = md.match(/\*\*Target:\*\*\s*([^\n]+)/);

  const msPerDay  = 86400000;
  const totalDays = Math.round((new Date(end).getTime() - new Date(start).getTime()) / msPerDay) + 1;

  return {
    title:       titleMatch?.[1]?.trim() ?? "Training Plan",
    phase:       phaseMatch?.[1]?.trim() ?? "",
    chronicLoad: chronicMatch?.[1]?.trim() ?? "",
    target:      targetMatch?.[1]?.trim() ?? "",
    totalDays,
    totalWeeks: Math.ceil(totalDays / 7),
  };
}


// ── Page ─────────────────────────────────────────────────────────────────────

export default async function PlanPage() {
  const today = todayISO();
  const sb    = createServerClient();
  const uid   = await getUserId();

  const planRes = await sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1);
  const plan: Plan | null = planRes.data?.[0] ?? null;
  const planId = plan?.id ?? null;

  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const [daysRes, strengthRes, activitiesRes, replanJobs, athleteProfile, completedSetsRes] = await Promise.all([
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).order("date")
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("strength_sessions").select("*, exercises(*)").eq("user_id", uid).eq("plan_id", planId).order("date")
      : Promise.resolve({ data: [] }),
    plan
      ? sb.from("completed_activities").select("*").eq("user_id", uid).gte("date", plan.start_date).lte("date", plan.end_date)
      : Promise.resolve({ data: [] }),
    getReplanJobs(),
    getAthleteProfile(),
    sb.from("completed_exercise_sets").select("exercise_id, date, reps, weight_kg, prescribed_reps_min")
      .eq("user_id", uid).gte("date", sixtyDaysAgo).order("date", { ascending: false }),
  ]);

  if (!plan) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
          No plan found. Run <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>--replan</code> to generate one.
        </div>
      </div>
    );
  }

  const allDays: ScheduledDay[] = (daysRes.data ?? []).filter(
    d => d.date >= plan.start_date && d.date <= plan.end_date
  );

  // Completed Garmin activities, grouped by date
  const activityMap: Record<string, CompletedActivity[]> = {};
  for (const a of (activitiesRes.data ?? []) as CompletedActivity[]) {
    (activityMap[a.date] ??= []).push(a);
  }

  // Enrich each day with purpose/adaptation parsed from plan markdown + completed activities
  const dayMap: Record<string, DayData> = Object.fromEntries(
    allDays.map(d => {
      const meta = parseDayMeta(plan.markdown, d.date);
      return [d.date, { ...d, purpose: meta.purpose, adaptation: meta.adaptation, completedActivities: activityMap[d.date] ?? [] }];
    })
  );

  // Strength sessions indexed by date, exercises sorted by display_order
  const strengthMap: Record<string, StrengthSession> = buildStrengthMap(
    (strengthRes.data ?? []).filter((s: { date: string }) => s.date >= plan.start_date && s.date <= plan.end_date)
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

  const meta      = parseMeta(plan.markdown, plan.start_date, plan.end_date);
  const weekGoals = parseWeekGoals(plan.markdown);

  const created = new Date(plan.created_at).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="page">

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{meta.title}</h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          {formatShort(plan.start_date)} – {formatShort(plan.end_date)}
          &nbsp;·&nbsp; {meta.totalWeeks} weeks
          &nbsp;·&nbsp;Generated {created}
        </p>
      </div>

      {/* ── Replan actions ── */}
      <section className="section" style={{ marginTop: 0, marginBottom: 24 }}>
        <h2 className="section-title">Actions</h2>
        <ReplanPanel initialJobs={replanJobs} scheduledDays={(daysRes.data ?? []) as ScheduledDay[]} />
      </section>

      {/* ── Phase banner ── */}
      {meta.phase && (() => {
        const phaseMatch = meta.phase.match(/^([\d\s→\-–]+)\s*\(([^)]+)\)/);
        const phaseLabel = phaseMatch ? `Phase ${phaseMatch[1].trim()}` : null;
        const phaseName  = phaseMatch ? phaseMatch[2].trim() : meta.phase;

        const startMs    = new Date(plan.start_date + "T00:00:00").getTime();
        const endMs      = new Date(plan.end_date   + "T00:00:00").getTime();
        const todayMs    = new Date(today           + "T00:00:00").getTime();
        const progress   = Math.min(100, Math.max(0, ((todayMs - startMs) / (endMs - startMs)) * 100));
        const currentWeek = Math.max(1, Math.ceil((todayMs - startMs) / (7 * 86400000)));

        return (
          <div className="card" style={{ marginBottom: 0, borderLeft: "3px solid var(--accent)" }}>
            {/* Top row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--accent)" }}>
                {phaseLabel ?? "Current Phase"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {meta.chronicLoad && (
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Entry load {meta.chronicLoad}</span>
                )}
                <span className="badge badge-accent">Week {currentWeek} / {meta.totalWeeks}</span>
              </div>
            </div>

            {/* Phase name */}
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3, color: "var(--text)", marginBottom: 16 }}>
              {phaseName}
            </div>

            {/* Season progress */}
            <div style={{ marginBottom: meta.target ? 16 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: "var(--dim)" }}>Season progress</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                  {Math.round(progress)}%
                </span>
              </div>
              <div style={{ height: 6, background: "rgba(var(--overlay-rgb),.08)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: 3 }} />
              </div>
            </div>

            {/* Target */}
            {meta.target && (
              <div style={{ borderTop: "1px solid rgba(var(--overlay-rgb),.07)", paddingTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 6 }}>
                  Target
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{meta.target}</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Season calendar (interactive) ── */}
      <section className="section">
        <h2 className="section-title">Season Calendar</h2>
        <PlanCalendar
          startDate={plan.start_date}
          endDate={plan.end_date}
          dayMap={dayMap}
          strengthMap={strengthMap}
          today={today}
          bench1RMKg={athleteProfile?.bench_1rm_kg}
          weightRecommendations={weightRecommendations}
        />
      </section>

      {/* ── Week-by-week strategy ── */}
      {weekGoals.length > 0 && (
        <section className="section">
          <h2 className="section-title">Week-by-week Strategy</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>Week</th>
                  <th>Goal</th>
                </tr>
              </thead>
              <tbody>
                {weekGoals.map((w, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: "var(--accent)", fontSize: 12 }}>
                      {w.heading.split("—")[0].trim()}
                      <div style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)", marginTop: 2 }}>
                        {w.heading.split("—")[1]?.trim()}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{w.goal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}


    </div>
  );
}
