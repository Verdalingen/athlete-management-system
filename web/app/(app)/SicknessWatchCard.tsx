"use client";

import { useT } from "@/lib/i18n/LanguageContext";

export interface SicknessSignal {
  label: string;
  value: number | null;
  unit: string;
  baselineMean: number | null;
  direction: "above" | "below";
  flagged: boolean;
}

/** Composite early-illness indicator — no single wearable metric predicts
 * getting sick reliably on its own, but HRV suppression, an elevated resting
 * HR, and poor Body Battery recharge moving off-baseline *together* is the
 * pattern consumer wearables (Whoop, Oura) actually flag on. Native
 * `<details>` for the expand/collapse — the summary line alone is already
 * the "at a glance" view Adrian asked for, no JS needed to show it. */
export function SicknessWatchCard({ signals }: { signals: SicknessSignal[] }) {
  const t = useT().dashboard.sicknessWatch;
  const known = signals.filter(s => s.value != null && s.baselineMean != null);
  const flaggedCount = known.filter(s => s.flagged).length;

  const hasEnoughData = known.length >= 2;
  const status = !hasEnoughData
    ? { label: t.notEnoughHistory, color: "var(--dim)", icon: "ti-help-circle" }
    : flaggedCount >= 2
    ? { label: t.multipleFlagged.replace("{count}", String(flaggedCount)), color: "var(--red)", icon: "ti-alert-triangle" }
    : flaggedCount === 1
    ? { label: t.oneFlagged, color: "var(--amber)", icon: "ti-alert-circle" }
    : { label: t.allNormal, color: "var(--green)", icon: "ti-shield-check" };

  return (
    <div className="card">
      <details>
        <summary style={{ listStyle: "none", cursor: "pointer", userSelect: "none", outline: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <div className="card-title" style={{ margin: 0, flexShrink: 0 }}>{t.title}</div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto",
            padding: "4px 10px", borderRadius: 20,
            background: `rgba(${STATUS_RGB[status.color] ?? "124,138,144"}, .12)`,
            border: `1px solid rgba(${STATUS_RGB[status.color] ?? "124,138,144"}, .32)`,
          }}>
            <i className={`ti ${status.icon}`} style={{ fontSize: 13, color: status.color }} aria-hidden="true" />
            <span style={{ fontSize: 12, fontWeight: 700, color: status.color }}>{status.label}</span>
          </div>
          <i className="ti ti-chevron-down" style={{ fontSize: 14, color: "var(--dim)", flexShrink: 0 }} aria-hidden="true" />
        </summary>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 16 }}>
          {signals.map((s) => {
            const isKnown = s.value != null && s.baselineMean != null;
            const arrow = s.direction === "below" ? "ti-trending-down" : "ti-trending-up";
            return (
              <div key={s.label} className="kpi">
                <div className="kpi-label">{s.label}</div>
                <div className="kpi-value" style={{ fontSize: isKnown ? undefined : 14, color: isKnown ? undefined : "var(--dim)" }}>
                  {s.value != null ? s.value.toFixed(0) : "—"}
                  {s.value != null && <span className="kpi-unit">{s.unit}</span>}
                </div>
                {isKnown ? (
                  <div className="kpi-note">
                    <span className={`badge ${s.flagged ? "badge-red" : "badge-green"}`}>
                      <i className={`ti ${arrow}`} style={{ marginRight: 4, fontSize: 10 }} aria-hidden="true" />
                      {s.flagged ? t.offBaseline : t.normal}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--dim)", marginLeft: 6 }}>
                      {t.baseline.replace("{value}", s.baselineMean!.toFixed(0)).replace("{unit}", s.unit)}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 6 }}>
                    {s.value == null ? t.noDataToday : t.buildingBaseline}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

// Matches the rgbVar() convention used elsewhere on the dashboard (page.tsx)
// for tinted pill backgrounds — kept local since this is the only component
// using status colors this way outside page.tsx itself.
const STATUS_RGB: Record<string, string> = {
  "var(--green)": "var(--green-rgb)",
  "var(--amber)": "var(--amber-rgb)",
  "var(--red)": "var(--red-rgb)",
  "var(--dim)": "var(--dim-rgb, 124,138,144)",
};
