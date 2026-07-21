"use client";

import { useTheme } from "@/app/ThemeContext";

/** Same segmented-button pattern as the Nutrition page's g/oz unit toggle
 * (active segment: rgba(124,92,255,.15) bg + var(--accent) text) — reused
 * here rather than a new switch style, since it's already the app's
 * established "pick one of two" control. */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();

  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      {(["light", "dark"] as const).map(t => (
        <button
          key={t}
          type="button"
          onClick={() => setTheme(t)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 700, padding: "8px 14px", border: "none", cursor: "pointer",
            background: theme === t ? "rgba(124,92,255,.15)" : "none",
            color: theme === t ? "var(--accent)" : "var(--dim)",
          }}
        >
          <i className={`ti ${t === "light" ? "ti-sun" : "ti-moon"}`} aria-hidden="true" />
          {t === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
