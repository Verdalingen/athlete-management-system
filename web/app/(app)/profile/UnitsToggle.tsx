"use client";

import { useUnitSystem } from "@/app/(app)/nutrition/UnitSystemContext";
import { useT } from "@/lib/i18n/LanguageContext";

/** Same segmented-button pattern as ThemeToggle. Moved here from the nutrition
 * page's top bar (it was one button too many in that row) — governs both food
 * quantities (g vs oz/lb) and, in recipe instructions, temperature (°C vs °F). */
export function UnitsToggle() {
  const [unitSystem, setUnitSystem] = useUnitSystem();
  const t = useT();

  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      {(["metric", "imperial"] as const).map(u => (
        <button
          key={u}
          type="button"
          onClick={() => setUnitSystem(u)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 700, padding: "8px 14px", border: "none", cursor: "pointer",
            background: unitSystem === u ? "rgba(124,92,255,.15)" : "none",
            color: unitSystem === u ? "var(--accent)" : "var(--dim)",
          }}
        >
          {u === "metric" ? t.profile.units.metric : t.profile.units.imperial}
        </button>
      ))}
    </div>
  );
}
