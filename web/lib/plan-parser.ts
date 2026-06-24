export interface WeekGoal {
  heading: string;
  phase: string;
  goal: string;
}

export interface DayMeta {
  purpose: string;
  adaptation: string;
}

export function parseWeekGoals(md: string): WeekGoal[] {
  const rx = /##\s+(Week\s+\d[^\n]*)\n\*([^*]+)\*/g;
  const goals: WeekGoal[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(md)) !== null) {
    const heading = m[1].trim();
    const [, rest] = heading.split("—");
    goals.push({ heading, phase: rest?.trim() ?? "", goal: m[2].trim() });
  }
  return goals;
}

function isoToMarkdownDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
  const day = d.getUTCDate();
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()];
  return `${wd}, ${day} ${mo}`;
}

export function parseDayMeta(md: string, iso: string): DayMeta {
  const heading = isoToMarkdownDate(iso);
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`### ${escaped}\\n([\\s\\S]+?)(?=\\n---\\n|\\n## |$)`);
  const block = md.match(rx)?.[1] ?? "";
  return {
    purpose:    block.match(/\*\*PURPOSE:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? "",
    adaptation: block.match(/\*\*ADAPTATION:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? "",
  };
}

export function currentWeekGoal(goals: WeekGoal[], planStart: string, weekStart: string): WeekGoal | null {
  const msPerDay = 86400000;
  const idx = Math.floor(
    (new Date(weekStart).getTime() - new Date(planStart).getTime()) / (msPerDay * 7)
  );
  return goals[idx] ?? null;
}
