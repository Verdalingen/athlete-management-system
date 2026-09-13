"use client";

import { useLanguage, useT } from "@/lib/i18n/LanguageContext";
import type { Language } from "@/lib/i18n/language";

/** Same segmented-button pattern as ThemeToggle/UnitsToggle. Persists to `user_settings.language`
 * (via LanguageProvider's `persist`) — not just this device — since the coaching pipeline reads
 * the same column when writing AI-generated plans and feedback. */
export function LanguageToggle() {
  const [language, setLanguage] = useLanguage();
  const t = useT();

  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      {(["en", "no"] as const satisfies readonly Language[]).map(l => (
        <button
          key={l}
          type="button"
          onClick={() => setLanguage(l)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 700, padding: "8px 14px", border: "none", cursor: "pointer",
            background: language === l ? "rgba(124,92,255,.15)" : "none",
            color: language === l ? "var(--accent)" : "var(--dim)",
          }}
        >
          {l === "en" ? t.profile.language.english : t.profile.language.norwegian}
        </button>
      ))}
    </div>
  );
}
