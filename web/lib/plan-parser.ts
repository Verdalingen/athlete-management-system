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

function isoToTableDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
  const day = d.getUTCDate();
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()];
  return `${wd}, ${mo} ${day}`;
}

// Plans appear in two markdown shapes, depending on how the planner formatted them:
//   1. a table row:  | **Mon, Jul 6** | Focus | Workout | Purpose | If Tired |
//   2. a bold day line followed by labelled lines (the weekly planner's usual output):
//        **Mon, Jul 6 — FOCUS: Rest**
//        WORKOUT: ...
//        PURPOSE: ...
//        ADAPTATION: ...
export function parseDayMeta(md: string, iso: string): DayMeta {
  const heading = isoToTableDate(iso);
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const rowRx = new RegExp(`\\|\\s*\\*{0,2}${escaped}\\*{0,2}\\s*\\|([^\\n]*)`);
  const rest = rowRx.exec(md)?.[1];
  if (rest != null) {
    const cells = rest.split("|").map(c => c.trim());
    const adaptationRaw = cells[3] ?? "";
    return {
      purpose: cells[2] ?? "",
      adaptation: /^[-—]*$/.test(adaptationRaw) ? "" : adaptationRaw,
    };
  }

  const blockRx = new RegExp(
    `\\*\\*${escaped}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*\\*\\*(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),|\\n#|$)`
  );
  const block = blockRx.exec(md)?.[1] ?? "";
  const label = (name: string) =>
    block.match(new RegExp(`(?:^|\\n)\\s*\\*{0,2}${name}:?\\*{0,2}:?\\s*([^\\n]+)`, "i"))?.[1]?.trim() ?? "";
  return { purpose: label("PURPOSE"), adaptation: label("ADAPTATION") };
}

export function currentWeekGoal(goals: WeekGoal[], planStart: string, weekStart: string): WeekGoal | null {
  const msPerDay = 86400000;
  const idx = Math.floor(
    (new Date(weekStart).getTime() - new Date(planStart).getTime()) / (msPerDay * 7)
  );
  return goals[idx] ?? null;
}
