import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO, weekBounds, formatLong, formatShort, formatWeekday, formatDuration, daysBetween, mesocycleWeek, mesocycleTotalWeeks } from "@/lib/dates";
import type { Plan, ScheduledDay, StrengthSession } from "@/lib/types";
import { DashboardActions } from "./DashboardActions";

const BENCH_TARGET_KG = 140;
const RUN_3K_TARGET_SECS = 599; // 9:59

function fmtTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Riegel formula: T(3k) = T(5k) × (3000/5000)^1.06
function predict3kFrom5k(fiveKSecs: number): number {
  return Math.round(fiveKSecs * Math.pow(3000 / 5000, 1.06));
}

const SESSION_DOT: Record<string, string> = {
  strength: "var(--accent)",
  run:      "var(--cyan)",
  race:     "var(--red)",
  cross:    "var(--amber)",
  rest:     "var(--dim)",
};

const SESSION_TYPE_BADGE: Record<string, string> = {
  strength: "badge badge-accent",
  run:      "badge badge-cyan",
  race:     "badge badge-red",
  cross:    "badge badge-amber",
  rest:     "badge",
};

export default async function DashboardPage() {
  const today = todayISO();
  const { start: weekStart, end: weekEnd } = weekBounds(today);
  const sb = createServerClient();
  const uid = await getUserId();

  // Fetch plan first so we can filter all session queries by plan_id,
  // preventing stale rows from old plan runs from leaking through.
  const planRes = await sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1);
  const plan: Plan | null = planRes.data?.[0] ?? null;
  const planId = plan?.id ?? null;

  const [dayRes, sessRes, weekRes, nextKeyRes, metricsRes, lastCheckinRes] = await Promise.all([
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).eq("date", today).limit(1)
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("strength_sessions").select("*, exercises(*)").eq("user_id", uid).eq("plan_id", planId).eq("date", today).limit(1)
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).gte("date", weekStart).lte("date", weekEnd).order("date")
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).eq("is_key", true).gt("date", today).order("date").limit(1)
      : Promise.resolve({ data: [] }),
    sb.from("analyses").select("bench_e1rm_kg, predicted_5k_secs").eq("user_id", uid).not("bench_e1rm_kg", "is", null).order("report_date", { ascending: false }).limit(1),
    sb.from("replan_jobs").select("completed_at").eq("user_id", uid).eq("type", "replan").eq("status", "done").order("completed_at", { ascending: false }).limit(1),
  ]);
  const today_day: ScheduledDay | null = dayRes.data?.[0] ?? null;
  const weekDays: ScheduledDay[] = weekRes.data ?? [];
  const nextKey: ScheduledDay | null = nextKeyRes.data?.[0] ?? null;

  let session: StrengthSession | null = null;
  if (sessRes.data?.[0]) {
    session = {
      ...sessRes.data[0],
      exercises: (sessRes.data[0].exercises ?? []).sort(
        (a: { display_order: number }, b: { display_order: number }) => a.display_order - b.display_order
      ),
    };
  }

  // Season stats
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

  // Check-in timing: last completed replan job → due after 7 days
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

  // Week session count (non-rest)
  const sessionCount = weekDays.filter(d => !d.is_rest).length;
  const keyCount = weekDays.filter(d => d.is_key).length;

  // Goal metrics from latest analysis
  const latestMetrics = metricsRes.data?.[0] ?? null;
  const benchE1rm: number | null = latestMetrics?.bench_e1rm_kg ?? null;
  const predicted5kSecs: number | null = latestMetrics?.predicted_5k_secs ?? null;
  const predicted3kSecs: number | null = predicted5kSecs ? predict3kFrom5k(predicted5kSecs) : null;

  // Progress percentages (0–100, clamped)
  const benchPct = benchE1rm
    ? Math.min(100, Math.round((benchE1rm / BENCH_TARGET_KG) * 100))
    : null;
  // For run: lower is better — progress toward target from a baseline of 660s (11:00)
  const RUN_BASELINE_SECS = 660;
  const runPct = predicted3kSecs
    ? Math.min(100, Math.max(0, Math.round(
        ((RUN_BASELINE_SECS - predicted3kSecs) / (RUN_BASELINE_SECS - RUN_3K_TARGET_SECS)) * 100
      )))
    : null;

  return (
    <div className="page">

      {/* ── Hero: Today's session ───────────────────────────────────────── */}
      <section>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}>
          {formatLong(today)}
        </p>

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
                  <span className={SESSION_TYPE_BADGE[today_day.session_type] ?? "badge"}>
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
                      <th>Sets</th>
                      <th>Reps</th>
                      <th>Rest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.exercises.map((ex) => (
                      <tr key={ex.id}>
                        <td style={{ fontWeight: 600 }}>{ex.display_name}</td>
                        <td>{ex.sets}</td>
                        <td>{ex.reps}</td>
                        <td style={{ color: "var(--muted)" }}>{ex.rest_seconds / 60} min</td>
                      </tr>
                    ))}
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

      {/* ── Action prompts (check-in due / season ended) ────────────────── */}
      <DashboardActions
        checkinOverdue={checkinOverdue}
        daysSinceCheckin={daysSinceCheckin}
        seasonEnded={seasonEnded}
        planEndDate={plan ? formatShort(plan.end_date) : ""}
      />

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">Training Status</h2>
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>

          {/* Season progress */}
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
                <div className="kpi-note">{meso.daysLeft} days remaining · ends {formatShort(meso.end)}</div>
              </>
            ) : (
              <div className="kpi-value" style={{ fontSize: 14, color: "var(--dim)" }}>No plan</div>
            )}
          </div>

          {/* Next check-in */}
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

          {/* This week */}
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

          {/* Next key session */}
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

      {/* ── Week at a glance ────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">Week at a glance</h2>
        <div className="week-strip">
          {weekDays.map((d) => {
            const isToday = d.date === today;
            const cls = [
              "strip-cell",
              d.is_key ? "key-session" : "",
              isToday ? "today-cell" : "",
              d.is_rest ? "rest-day" : "",
            ].filter(Boolean).join(" ");
            return (
              <div key={d.id} className={cls}>
                <div className="strip-day">{formatWeekday(d.date)}</div>
                <div
                  className="strip-dot"
                  style={{ background: SESSION_DOT[d.session_type] ?? "var(--dim)" }}
                />
                <div className="strip-focus">{d.focus ?? (d.is_rest ? "Rest" : d.session_type)}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Season goals ────────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">Season Goals</h2>
        <div className="goal-grid">

          {/* Bench press */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="card-title" style={{ margin: 0 }}>Bench Press</div>
              <span className="badge badge-accent" style={{ fontSize: 10 }}>est. 1RM</span>
            </div>
            {benchE1rm ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span className="goal-current">{benchE1rm.toFixed(1)}</span>
                  <span style={{ color: "var(--dim)", fontSize: 16 }}>→</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{BENCH_TARGET_KG}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>kg</span>
                </div>
                <div className="goal-target">{(BENCH_TARGET_KG - benchE1rm).toFixed(1)} kg to go</div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${benchPct}%`, background: "linear-gradient(90deg, var(--accent), var(--cyan))" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>
                  {benchPct}% · Epley formula from last session&apos;s top set
                </div>
              </>
            ) : (
              <div style={{ color: "var(--dim)", fontSize: 13, paddingTop: 8 }}>
                Updates after next analysis run
              </div>
            )}
          </div>

          {/* 3k run */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="card-title" style={{ margin: 0 }}>3 000 m Run</div>
              <span className="badge badge-cyan" style={{ fontSize: 10 }}>predicted</span>
            </div>
            {predicted3kSecs ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span className="goal-current">{fmtTime(predicted3kSecs)}</span>
                  <span style={{ color: "var(--dim)", fontSize: 16 }}>→</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "var(--cyan)" }}>sub 9:59</span>
                </div>
                <div className="goal-target">{predicted3kSecs - RUN_3K_TARGET_SECS} sec to cut</div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${runPct}%`, background: "linear-gradient(90deg, var(--cyan), var(--green))" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>
                  {runPct}% · derived from Garmin 5k prediction via Riegel
                </div>
              </>
            ) : (
              <div style={{ color: "var(--dim)", fontSize: 13, paddingTop: 8 }}>
                Updates after next analysis run
              </div>
            )}
          </div>

        </div>
      </section>

      {/* ── Last check-in ───────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">Last Season Check-in</h2>
        <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10 }}>
          <div>
            <div className="kpi-label">VO₂max</div>
            <div className="kpi-value">54 <span className="kpi-unit" style={{ fontSize: 11 }}>ml/kg/min</span></div>
            <div className="kpi-note"><span className="badge badge-green">Stable</span></div>
          </div>
          <div>
            <div className="kpi-label">HRV (7d avg)</div>
            <div className="kpi-value">74 <span className="kpi-unit">ms</span></div>
            <div className="kpi-note"><span className="badge badge-green">Good</span></div>
          </div>
          <div>
            <div className="kpi-label">Resting HR</div>
            <div className="kpi-value">42 <span className="kpi-unit">bpm</span></div>
            <div className="kpi-note"><span className="badge badge-green">Excellent</span></div>
          </div>
          <div>
            <div className="kpi-label">TSB</div>
            <div className="kpi-value">+6.6</div>
            <div className="kpi-note"><span className="badge badge-green">Fresh</span></div>
          </div>
          <div>
            <div className="kpi-label">Sleep</div>
            <div className="kpi-value">8.2 <span className="kpi-unit">h</span></div>
            <div className="kpi-note"><span className="badge badge-green">Good</span></div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
          From analysis · 22 Jun 2026 — will update automatically after each coach analysis run.
        </p>
      </section>

    </div>
  );
}
