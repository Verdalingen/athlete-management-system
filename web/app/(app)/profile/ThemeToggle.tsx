"use client";

import { useTheme } from "@/app/ThemeContext";
import { useT } from "@/lib/i18n/LanguageContext";

/** Same segmented-button pattern as the Nutrition page's g/oz unit toggle
 * (active segment: rgba(124,92,255,.15) bg + var(--accent) text) — reused
 * here rather than a new switch style, since it's already the app's
 * established "pick one of two" control. */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const t = useT();

  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      {(["light", "dark"] as const).map(mode => (
        <button
          key={mode}
          type="button"
          onClick={() => setTheme(mode)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 700, padding: "8px 14px", border: "none", cursor: "pointer",
            background: theme === mode ? "rgba(124,92,255,.15)" : "none",
            color: theme === mode ? "var(--accent)" : "var(--dim)",
          }}
        >
          <i className={`ti ${mode === "light" ? "ti-sun" : "ti-moon"}`} aria-hidden="true" />
          {mode === "light" ? t.profile.appearance.light : t.profile.appearance.dark}
        </button>
      ))}
    </div>
  );
}
