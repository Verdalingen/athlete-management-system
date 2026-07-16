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

export const SESSION_COLOR: Record<string, string> = {
  strength: "var(--accent)",
  run:      "var(--cyan)",
  race:     "var(--red)",
  cross:    "var(--amber)",
  swim:     "var(--blue)",
  bike:     "var(--green)",
  rest:     "var(--dim)",
};

export const SESSION_BADGE: Record<string, string> = {
  strength: "badge badge-accent",
  run:      "badge badge-cyan",
  race:     "badge badge-red",
  cross:    "badge badge-amber",
  swim:     "badge badge-blue",
  bike:     "badge badge-green",
};
