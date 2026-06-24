import { createServerClient, userId } from "@/lib/supabase-server";
import { todayISO, weekBounds, formatLong, formatShort, formatWeekday, formatDuration, daysBetween, mesocycleWeek, mesocycleTotalWeeks } from "@/lib/dates";
import type { Plan, ScheduledDay, StrengthSession } from "@/lib/types";

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
  const uid = userId();

  const [planRes, dayRes, sessRes, weekRes, nextKeyRes, metricsRes] = await Promise.all([
    sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
    sb.from("scheduled_days").select("*").eq("user_id", uid).eq("date", today).order("created_at", { ascending: false }).limit(1),
    sb.from("strength_sessions").select("*, exercises(*)").eq("user_id", uid).eq("date", today).order("created_at", { ascending: false }).limit(1),
    sb.from("scheduled_days").select("*").eq("user_id", uid).gte("date", weekStart).lte("date", weekEnd).order("date"),
    sb.from("scheduled_days").select("*").eq("user_id", uid).eq("is_key", true).gt("date", today).order("date").limit(1),
    sb.from("analyses").select("bench_e1rm_kg, predicted_5k_secs").eq("user_id", uid).not("bench_e1rm_kg", "is", null).order("report_date", { ascending: false }).limit(1),
  ]);

  const plan: Plan | null = planRes.data?.[0] ?? null;
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

  // Mesocycle stats
  const meso = plan
    ? {
        week: mesocycleWeek(plan.start_date, today),
        totalWeeks: mesocycleTotalWeeks(plan.start_date, plan.end_date),
        daysLeft: Math.max(0, daysBetween(today, plan.end_date)),
        pct: Math.min(100, Math.max(0, Math.round((daysBetween(plan.start_date, today) / daysBetween(plan.start_date, plan.end_date)) * 100))),
        end: plan.end_date,
      }
    : null;

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

      {/* ── Today's Session ─────────────────────────────────────────────── */}
      <section>
        <p style={{ fontSize: 12, color: "var(--muted)", letterSpacing: ".3px", marginBottom: 8 }}>
          {formatLong(today)}
        </p>

        {today_day ? (
          <div className={`card ${today_day.is_key ? "card-accent" : "card-cyan"}`}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, marginBottom: 6 }}>
                  {today_day.focus ?? today_day.session_type}
                </h1>
                {today_day.description && (
                  <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 8 }}>
                    {today_day.description}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className={SESSION_TYPE_BADGE[today_day.session_type] ?? "badge"}>
                    {today_day.session_type}
                  </span>
                  {today_day.is_key && <span className="badge badge-accent">Key session</span>}
                  {session && (
                    <span className="badge badge-blue">{formatDuration(session.estimated_duration_secs)}</span>
                  )}
                </div>
              </div>
              {today_day.is_rest && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 36 }}>🛌</div>
                </div>
              )}
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

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title">Training Status</h2>
        <div className="stat-grid">

          {/* Mesocycle progress */}
          <div className="kpi">
            <div className="kpi-label">Mesocycle</div>
            {meso ? (
              <>
                <div className="kpi-value">
                  Wk {meso.week}<span className="kpi-unit">/ {meso.totalWeeks}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${meso.pct}%`, background: "var(--accent)" }} />
                </div>
                <div className="kpi-note">{meso.daysLeft} days remaining · ends {formatShort(meso.end)}</div>
              </>
            ) : (
              <div className="kpi-value" style={{ fontSize: 14, color: "var(--dim)" }}>No plan</div>
            )}
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
