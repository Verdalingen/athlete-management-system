// Shared month-grid calendar helpers — used by both PlanCalendar (full season
// view) and MiniMonthCalendar (dashboard's compact single-month view) so the
// grid-building logic (leading blanks, trailing padding to a full week) lives
// in one place.

export interface CalDay {
  iso: string | null;
  day: number | null;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function buildMonthCells(year: number, month: number): CalDay[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const leadBlanks = (first.getDay() + 6) % 7;
  const cells: CalDay[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push({ iso: null, day: null });
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ iso: null, day: null });
  return cells;
}

export function monthsInRange(start: string, end: string): { year: number; month: number }[] {
  const e = new Date(end);
  const months: { year: number; month: number }[] = [];
  const cur = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 1);
  while (cur <= e) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}
