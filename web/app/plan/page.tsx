import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO, formatShort } from "@/lib/dates";
import { parseWeekGoals, parseDayMeta } from "@/lib/plan-parser";
import type { Plan, ScheduledDay, StrengthSession } from "@/lib/types";
import { PlanCalendar } from "./PlanCalendar";
import type { DayData } from "./PlanCalendar";
import { ReplanPanel } from "./ReplanPanel";
import { getReplanJobs } from "@/app/actions/replan";

// ── Markdown parsers ──────────────────────────────────────────────────────────

interface PlanMeta {
  title: string;
  phase: string;
  chronicLoad: string;
  target: string;
  totalDays: number;
  totalWeeks: number;
}

interface Zone {
  zone: string;
  name: string;
  pct: string;
  effort: string;
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

function parseZones(md: string): Zone[] {
  const block = md.match(/##\s+Intensity Zones\n\n([\s\S]+?)(?:\n---|\n##)/);
  if (!block) return [];
  const rows = block[1].split("\n").filter(l => l.startsWith("|") && !l.includes("---") && !l.includes("Zone"));
  return rows.map(row => {
    const cols = row.split("|").map(s => s.trim()).filter(Boolean);
    return { zone: cols[0], name: cols[1], pct: cols[2], effort: cols[3] };
  }).filter(z => z.zone && z.name);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function PlanPage() {
  const today = todayISO();
  const sb    = createServerClient();
  const uid   = await getUserId();

  const planRes = await sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1);
  const plan: Plan | null = planRes.data?.[0] ?? null;
  const planId = plan?.id ?? null;

  const [daysRes, strengthRes, replanJobs] = await Promise.all([
    planId
      ? sb.from("scheduled_days").select("*").eq("user_id", uid).eq("plan_id", planId).order("date")
      : Promise.resolve({ data: [] }),
    planId
      ? sb.from("strength_sessions").select("*, exercises(*)").eq("user_id", uid).eq("plan_id", planId).order("date")
      : Promise.resolve({ data: [] }),
    getReplanJobs(),
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

  // Enrich each day with purpose/adaptation parsed from plan markdown
  const dayMap: Record<string, DayData> = Object.fromEntries(
    allDays.map(d => {
      const meta = parseDayMeta(plan.markdown, d.date);
      return [d.date, { ...d, purpose: meta.purpose, adaptation: meta.adaptation }];
    })
  );

  // Strength sessions indexed by date, exercises sorted by display_order
  const strengthMap: Record<string, StrengthSession> = Object.fromEntries(
    (strengthRes.data ?? [])
      .filter((s: { date: string }) => s.date >= plan.start_date && s.date <= plan.end_date)
      .map((s: StrengthSession & { exercises: { display_order: number }[] }) => [
        s.date,
        {
          ...s,
          exercises: (s.exercises ?? []).sort(
            (a: { display_order: number }, b: { display_order: number }) => a.display_order - b.display_order
          ),
        },
      ])
  );

  const meta      = parseMeta(plan.markdown, plan.start_date, plan.end_date);
  const zones     = parseZones(plan.markdown);
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
        <ReplanPanel initialJobs={replanJobs} />
      </section>

      {/* ── Phase banner ── */}
      {meta.phase && (
        <div className="card card-accent" style={{ marginBottom: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                Current Phase
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{meta.phase}</div>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {meta.chronicLoad && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>Chronic Load (entry)</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{meta.chronicLoad}</div>
                </div>
              )}
              {meta.target && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>Target</div>
                  <div style={{ fontSize: 13, color: "var(--text)", maxWidth: 260 }}>{meta.target}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Season calendar (interactive) ── */}
      <section className="section">
        <h2 className="section-title">Season Calendar</h2>
        <PlanCalendar
          startDate={plan.start_date}
          endDate={plan.end_date}
          dayMap={dayMap}
          strengthMap={strengthMap}
          today={today}
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

      {/* ── Intensity zones ── */}
      {zones.length > 0 && (
        <section className="section">
          <h2 className="section-title">Intensity Zones</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Name</th>
                  <th>% HR max</th>
                  <th>Effort</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z, i) => (
                  <tr key={i}>
                    <td>
                      <span className="badge badge-accent">{z.zone}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{z.name}</td>
                    <td style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12 }}>{z.pct}</td>
                    <td style={{ color: "var(--muted)", fontSize: 12 }}>{z.effort}</td>
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
