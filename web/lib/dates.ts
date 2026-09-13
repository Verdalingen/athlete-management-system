import { localeTag, type Language } from "@/lib/i18n/language";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export function daysUntil(target: Date | string): number {
  const targetMs = target instanceof Date ? target.getTime() : new Date(target).getTime();
  return Math.ceil((targetMs - Date.now()) / 86400000);
}

export function daysSince(past: Date | string): number {
  const pastMs = past instanceof Date ? past.getTime() : new Date(past).getTime();
  return Math.round((Date.now() - pastMs) / 86400000);
}

export function weekBounds(today: string): { start: string; end: string } {
  const d = new Date(today);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

export function formatLong(iso: string, language: Language = "en"): string {
  return new Date(iso).toLocaleDateString(localeTag(language), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShort(iso: string, language: Language = "en"): string {
  return new Date(iso).toLocaleDateString(localeTag(language), {
    day: "numeric",
    month: "short",
  });
}

export function formatWeekday(iso: string, language: Language = "en"): string {
  return new Date(iso).toLocaleDateString(localeTag(language), { weekday: "short" });
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  );
}

export function mesocycleWeek(start: string, today: string): number {
  return Math.floor(daysBetween(start, today) / 7) + 1;
}

export function mesocycleTotalWeeks(start: string, end: string): number {
  return Math.ceil(daysBetween(start, end) / 7);
}

export function formatDuration(secs: number): string {
  const m = Math.round(secs / 60);
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `~${h}h ${rem}m` : `~${h}h`;
}
