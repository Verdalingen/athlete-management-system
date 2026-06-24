import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO, weekBounds, formatShort, formatDuration, daysBetween } from "@/lib/dates";
import { parseWeekGoals, parseDayMeta, currentWeekGoal } from "@/lib/plan-parser";
import type { ScheduledDay, StrengthSession, Plan } from "@/lib/types";

const TYPE_COLOR: Record<string, string> = {
  strength: "var(--accent)",
  run:      "var(--cyan)",
  race:     "var(--red)",
  cross:    "var(--amber)",
  rest:     "var(--dim)",
};

const TYPE_BADGE: Record<string, string> = {
  strength: "badge badge-accent",
  run:      "badge badge-cyan",
  race:     "badge badge-red",
  cross:    "badge badge-amber",
};

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

  const [daysRes, sessionsRes, planRes] = await Promise.all([
    sb.from("scheduled_days").select("*").eq("user_id", uid)
      .gte("date", start).lte("date", end).order("date"),
    sb.from("strength_sessions").select("*, exercises(*)").eq("user_id", uid)
      .gte("date", start).lte("date", end).order("date"),
    sb.from("plans").select("*").eq("user_id", uid)
      .order("created_at", { ascending: false }).limit(1),
  ]);

  const days: ScheduledDay[] = daysRes.data ?? [];
  const plan: Plan | null = planRes.data?.[0] ?? null;

  // Map date → strength session
  const sessionMap = new Map<string, StrengthSession>();
  for (const s of (sessionsRes.data ?? [])) {
    sessionMap.set(s.date, {
      ...s,
      exercises: (s.exercises ?? []).sort(
        (a: { display_order: number }, b: { display_order: number }) => a.display_order - b.display_order
      ),
    });
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
  const totalSecs = [...sessionMap.values()].reduce((s, ss) => s + ss.estimated_duration_secs, 0);

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
          const session = sessionMap.get(d.date);
          const meta = dayMetas[d.date];
          const accentColor = TYPE_COLOR[d.session_type] ?? "var(--dim)";

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
              {/* Card header row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: d.is_rest ? 0 : 14, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: isToday ? "var(--cyan)" : "var(--dim)", marginBottom: 3 }}>
                    {fullDate(d.date, isToday)} · {formatShort(d.date)}
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                    {d.is_rest ? "Rest" : (d.focus ?? d.session_type)}
                  </h2>
                  {d.description && !d.is_rest && (
                    <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                      {d.description}
                    </p>
                  )}
                </div>

                {/* Badges */}
                {!d.is_rest && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                    <span className={TYPE_BADGE[d.session_type] ?? "badge"}>{d.session_type}</span>
                    {d.is_key && <span className="badge badge-accent">Key</span>}
                    {session && (
                      <span className="badge badge-blue">{formatDuration(session.estimated_duration_secs)}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Exercise table for strength sessions */}
              {session && session.exercises.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Exercise</th>
                        <th style={{ width: 48 }}>Sets</th>
                        <th style={{ width: 48 }}>Reps</th>
                        <th style={{ width: 64 }}>Rest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.exercises.map(ex => (
                        <tr key={ex.id}>
                          <td style={{ fontWeight: 500 }}>{ex.display_name}</td>
                          <td>{ex.sets}</td>
                          <td>{ex.reps}</td>
                          <td style={{ color: "var(--muted)" }}>{ex.rest_seconds / 60} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Purpose & Adaptation */}
              {!d.is_rest && (meta.purpose || meta.adaptation) && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {meta.purpose && (
                    <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".5px", whiteSpace: "nowrap", paddingTop: 1 }}>Purpose</span>
                      <span style={{ color: "var(--muted)", lineHeight: 1.55 }}>{meta.purpose}</span>
                    </div>
                  )}
                  {meta.adaptation && (
                    <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: ".5px", whiteSpace: "nowrap", paddingTop: 1 }}>Adapt</span>
                      <span style={{ color: "var(--muted)", lineHeight: 1.55 }}>{meta.adaptation}</span>
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
