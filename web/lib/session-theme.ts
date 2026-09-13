import type { Language } from "@/lib/i18n/language";

// Single source of truth for session-type presentation (dot/border color,
// badge class, label) — imported by the dashboard, plan calendar, week view,
// replan panel, and session detail modal.

export const SESSION_LABEL: Record<string, string> = {
  strength: "Strength",
  run:      "Run",
  race:     "Race",
  cross:    "Cross-train",
  swim:     "Swim",
  bike:     "Bike",
  rest:     "Rest",
};

const SESSION_LABEL_NO: Record<string, string> = {
  strength: "Styrke",
  run:      "Løp",
  race:     "Konkurranse",
  cross:    "Kondisjon",
  swim:     "Svømming",
  bike:     "Sykkel",
  rest:     "Hvile",
};

export function sessionLabel(type: string, language: Language): string {
  const labels = language === "no" ? SESSION_LABEL_NO : SESSION_LABEL;
  return labels[type] ?? (type.charAt(0).toUpperCase() + type.slice(1));
}

// bike intentionally does not use --green: green/red are reserved for good/bad and
// up/down value judgments (readiness, surplus, PR hit) — a session type is a category,
// not a judgment, so it gets its own identity color instead.
export const SESSION_COLOR: Record<string, string> = {
  strength: "var(--accent)",
  run:      "var(--cyan)",
  race:     "var(--red)",
  cross:    "var(--amber)",
  swim:     "var(--blue)",
  bike:     "var(--blue)",
  rest:     "var(--dim)",
};

export const SESSION_BADGE: Record<string, string> = {
  strength: "badge badge-accent",
  run:      "badge badge-cyan",
  race:     "badge badge-red",
  cross:    "badge badge-amber",
  swim:     "badge badge-blue",
  bike:     "badge badge-blue",
};
