import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO, formatShort } from "@/lib/dates";
import { parseWeekGoals } from "@/lib/plan-parser";
import type { Plan, ScheduledDay } from "@/lib/types";

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
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const phaseMatch = md.match(/\*\*Phase:\*\*\s*([^\n|]+)/);
  const chronicMatch = md.match(/\*\*Chronic Load Entry:\*\*\s*([^\n|]+)/);
  const targetMatch = md.match(/\*\*Target:\*\*\s*([^\n]+)/);

  const msPerDay = 86400000;
  const totalDays = Math.round((new Date(end).getTime() - new Date(start).getTime()) / msPerDay) + 1;

  return {
    title: titleMatch?.[1]?.trim() ?? "Training Plan",
    phase: phaseMatch?.[1]?.trim() ?? "",
    chronicLoad: chronicMatch?.[1]?.trim() ?? "",
    target: targetMatch?.[1]?.trim() ?? "",
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


// ── Calendar builder ──────────────────────────────────────────────────────────

interface CalDay {
  iso: string | null;   // null = blank filler
  day: number | null;
}

function buildMonthCells(year: number, month: number): CalDay[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const leadBlanks = (first.getDay() + 6) % 7; // Mon = 0
  const cells: CalDay[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push({ iso: null, day: null });
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ iso: null, day: null });
  return cells;
}

function monthsInRange(start: string, end: string): { year: number; month: number }[] {
  const s = new Date(start);
  const e = new Date(end);
  const months: { year: number; month: number }[] = [];
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_HEADERS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const SESSION_COLOR: Record<string, string> = {
  strength: "var(--accent)",
  run:      "var(--cyan)",
  race:     "var(--red)",
  cross:    "var(--amber)",
  rest:     "var(--dim)",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function PlanPage() {
  const today = todayISO();
  const sb = createServerClient();
  const uid = await getUserId();

  const [planRes, daysRes] = await Promise.all([
    sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
    // fetch scheduled_days for a wide range — will be filtered after we know plan dates
    sb.from("scheduled_days").select("*").eq("user_id", uid).order("date"),
  ]);

  const plan: Plan | null = planRes.data?.[0] ?? null;

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
  const dayMap = new Map(allDays.map(d => [d.date, d]));

  const meta = parseMeta(plan.markdown, plan.start_date, plan.end_date);
  const zones = parseZones(plan.markdown);
  const weekGoals = parseWeekGoals(plan.markdown);
  const calMonths = monthsInRange(plan.start_date, plan.end_date);

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

      {/* ── Season calendar ── */}
      <section className="section">
        <h2 className="section-title">Season Calendar</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {calMonths.map(({ year, month }) => {
            const cells = buildMonthCells(year, month);
            return (
              <div key={`${year}-${month}`}>
                <div className="cal-month-label">{MONTH_NAMES[month]} {year}</div>
                <div className="cal-grid">
                  {DAY_HEADERS.map(h => (
                    <div key={h} className="cal-header">{h}</div>
                  ))}
                  {cells.map((cell, i) => {
                    if (!cell.iso) {
                      return <div key={i} className="cal-day is-blank" />;
                    }
                    const d = dayMap.get(cell.iso);
                    const isToday = cell.iso === today;
                    const isPast = cell.iso < today;
                    const cls = [
                      "cal-day",
                      d ? "has-session" : "",
                      d?.is_key ? "is-key" : "",
                      d?.is_rest ? "is-rest" : "",
                      isToday ? "is-today" : "",
                      isPast && !isToday ? "is-past" : "",
                    ].filter(Boolean).join(" ");

                    return (
                      <div key={cell.iso} className={cls}>
                        <div className={`cal-num${isToday ? " today" : ""}`}>{cell.day}</div>
                        {d && !d.is_rest && (
                          <>
                            <div className="cal-focus">{d.focus ?? d.session_type}</div>
                            <div className="cal-dot" style={{ background: SESSION_COLOR[d.session_type] ?? "var(--dim)" }} />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
          {([ ["Strength", "var(--accent)"], ["Run", "var(--cyan)"], ["Race", "var(--red)"], ["Cross", "var(--amber)"] ] as [string, string][]).map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {label}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, border: "1px solid rgba(124,92,255,.5)", background: "rgba(124,92,255,.1)" }} />
            Key session
          </div>
        </div>
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
