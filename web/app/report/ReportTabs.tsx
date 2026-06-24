"use client";

import { useState } from "react";

function extractMain(html: string): string {
  const start = html.indexOf('<main');
  const end = html.lastIndexOf('</main>');
  if (start === -1 || end === -1) return html;
  const tagEnd = html.indexOf('>', start);
  return html.slice(tagEnd + 1, end);
}

export default function ReportTabs({
  analysis,
  planning,
}: {
  analysis: string;
  planning: string;
}) {
  const [tab, setTab] = useState<"analysis" | "planning">("analysis");
  const html = tab === "analysis" ? analysis : planning;
  const mainContent = extractMain(html);

  return (
    <>
      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: "1px solid var(--border)", paddingBottom: 0,
      }}>
        {(["analysis", "planning"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, padding: "8px 16px",
              color: tab === t ? "var(--text)" : "var(--muted)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, transition: "color .15s",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Report content */}
      <div className="report-content" dangerouslySetInnerHTML={{ __html: mainContent }} />
    </>
  );
}
