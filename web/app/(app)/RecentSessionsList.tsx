import type { CompletedActivity } from "@/lib/types";
import { formatDuration, formatShort } from "@/lib/dates";

// No existing mapping from Garmin's raw activity_type to an icon — built from the
// actual values data_extractor.py normalizes to (running, cycling, swimming,
// strength_training, fitness_equipment, multisport, meditation).
const ACTIVITY_ICON: Record<string, string> = {
  running: "ti-run",
  cycling: "ti-bike",
  swimming: "ti-swimming",
  strength_training: "ti-barbell",
  fitness_equipment: "ti-barbell",
  multisport: "ti-triangle",
  meditation: "ti-yoga",
};

function iconFor(type: string | null): string {
  return (type && ACTIVITY_ICON[type]) || "ti-activity";
}

function statFor(a: CompletedActivity): string | null {
  // Garmin reports distance_meters: 0 (not null) for non-GPS activities like
  // strength — a bare `!= null` check would show a useless "0.00 km".
  if (a.distance_meters != null && a.distance_meters > 0) return `${(a.distance_meters / 1000).toFixed(2)} km`;
  if (a.duration_secs != null) return formatDuration(a.duration_secs);
  if (a.calories != null) return `${a.calories} kcal`;
  return null;
}

export function RecentSessionsList({ activities }: { activities: CompletedActivity[] }) {
  // Capped at 5 (not "however many exist") so this naturally sits close to the
  // heatmap card's height instead of towering over it — matches how the
  // inspiration dashboards size a "recent" list to its sibling panel.
  const recent = [...activities]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 5);

  return (
    <div className="card">
      <div className="card-title" style={{ margin: "0 0 10px" }}>Recent Sessions</div>
      {recent.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--dim)" }}>No completed activities synced yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {recent.map((a, i) => {
            const stat = statFor(a);
            return (
              <div
                key={a.activity_id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
                  borderBottom: i < recent.length - 1 ? "1px solid var(--overlay-2)" : "none",
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(var(--accent-rgb),.10)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <i className={`ti ${iconFor(a.activity_type)}`} style={{ fontSize: 15, color: "var(--accent)" }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.activity_name ?? a.activity_type ?? "Activity"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{formatShort(a.date)}</div>
                </div>
                {stat && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                    {stat}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
