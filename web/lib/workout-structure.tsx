import type React from "react";

export const ZONE_COLOR: Record<string, string> = {
  Z1: "rgba(255,255,255,.35)",
  Z2: "var(--cyan)",
  Z3: "var(--green)",
  Z4: "var(--amber)",
  Z5: "var(--red)",
};

export function colorizeZones(text: string): React.ReactNode[] {
  return text.split(/(Z[1-5])/g).map((part, i) =>
    ZONE_COLOR[part]
      ? <span key={i} style={{ color: ZONE_COLOR[part], fontWeight: 700 }}>{part}</span>
      : <span key={i}>{part}</span>
  );
}

export function phaseIcon(phase: string): string {
  const p = phase.toLowerCase();
  if (p.includes("warm"))                              return "ti-temperature-sun";
  if (p.includes("cool"))                              return "ti-snowflake";
  if (/\d+\s*[×x]\s*\(/.test(phase))                  return "ti-repeat";
  if (p.includes("tempo") || p.includes("threshold"))  return "ti-flame";
  if (p.includes("race") || p.includes("time trial"))  return "ti-trophy";
  if (p.includes("strides"))                           return "ti-bolt";
  return "ti-run";
}

export function WorkoutStructure({ description }: { description: string }) {
  const phases = description.split(/\s*\+\s*/);

  if (phases.length === 1) {
    return (
      <div style={{
        background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 8, padding: "12px 14px",
        fontSize: 13, lineHeight: 1.6, color: "var(--text)",
      }}>
        {colorizeZones(description)}
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 8, overflow: "hidden",
    }}>
      {phases.map((phase, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 14px",
            borderBottom: i < phases.length - 1 ? "1px solid rgba(255,255,255,.06)" : "none",
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 7, flexShrink: 0,
            background: "rgba(255,255,255,.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <i className={`ti ${phaseIcon(phase)}`} style={{ fontSize: 14, color: "var(--muted)" }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.45 }}>
            {colorizeZones(phase.trim())}
          </div>
        </div>
      ))}
    </div>
  );
}
