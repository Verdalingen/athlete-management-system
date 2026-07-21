"use client";

import { useState } from "react";
import { DeltaBadge } from "./DeltaBadge";

type TrendRow = { date: string; ctl: number | null; atl: number | null };
type Pt = { x: number; y: number };

/** Catmull-Rom spline converted to cubic Bezier segments — passes exactly
 * through every data point (raw values, not pre-averaged) with continuous
 * tangents. Tension is deliberately gentler than the textbook 1/6 default:
 * a smaller tangent magnitude means the curve doesn't swing/overshoot as far
 * past the direct point-to-point path on a sharp reversal, which is most of
 * what reads as "shaky" on a noisy series like ATL — without touching the
 * actual data values the way pre-averaging did. */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  const TENSION = 12;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / TENSION, cp1y = p1.y + (p2.y - p0.y) / TENSION;
    const cp2x = p2.x - (p3.x - p1.x) / TENSION, cp2y = p2.y - (p3.y - p1.y) / TENSION;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Dashboard hero chart — the single large, dominant visual on the page (per the
 * inspiration set: smooth gradient-fill lines as the anchor that breaks up the
 * otherwise uniform grid of small KPI boxes). Shows CTL (fitness) and ATL
 * (fatigue) together over a fixed last-3-months window — the detailed
 * CTL/ATL/TSB analysis with zone bands, timeframe toggle, and TSB bars still
 * lives on the Progress page; this is the glanceable version of the same pair. */
export function FitnessTrendChart({ data }: { data: TrendRow[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const rawRows = data.filter(d => d.ctl != null || d.atl != null);
  if (rawRows.length < 3) {
    return (
      <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="card-title" style={{ margin: 0 }}>Fitness &amp; Fatigue</div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--dim)" }}>
          Not enough training history yet.
        </div>
      </div>
    );
  }
  const rows = rawRows;

  const W = 900, H = 200;
  const PAD = { top: 16, right: 8, bottom: 24, left: 8 };
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;

  const allVals = rows.flatMap(r => [r.ctl, r.atl]).filter((v): v is number => v != null);
  const minV = Math.min(0, ...allVals), maxV = Math.max(...allVals);
  const range = (maxV - minV) || 1;
  const t0 = new Date(rows[0].date).getTime(), tEnd = new Date(rows[rows.length - 1].date).getTime();
  const tRange = tEnd - t0 || 1;

  const xFor = (date: string) => PAD.left + ((new Date(date).getTime() - t0) / tRange) * plotW;
  const yFor = (v: number) => PAD.top + plotH - ((v - minV) / range) * plotH;

  const ctlPts = rows.flatMap(r => r.ctl != null ? [{ x: xFor(r.date), y: yFor(r.ctl) }] : []);
  const atlPts = rows.flatMap(r => r.atl != null ? [{ x: xFor(r.date), y: yFor(r.atl) }] : []);
  const baseY = yFor(minV);

  const ctlLine = smoothPath(ctlPts);
  const atlLine = smoothPath(atlPts);
  const ctlArea = ctlPts.length > 1 ? `${ctlLine} L ${ctlPts[ctlPts.length - 1].x.toFixed(1)} ${baseY} L ${ctlPts[0].x.toFixed(1)} ${baseY} Z` : "";
  const atlArea = atlPts.length > 1 ? `${atlLine} L ${atlPts[atlPts.length - 1].x.toFixed(1)} ${baseY} L ${atlPts[0].x.toFixed(1)} ${baseY} Z` : "";

  const latestCtl = [...rows].reverse().find(r => r.ctl != null)?.ctl ?? null;
  const ctlRows = rows.filter(r => r.ctl != null);

  // Delta vs. 7 (data-)days before whichever date is current — the latest
  // date when nothing's hovered, but the hovered date once it is, so the
  // badge doesn't keep showing "vs 7d ago" for the latest day while the big
  // number above it has already moved to an earlier hovered date.
  function ctlDeltaAsOf(date: string | null): number | null {
    const targetIdx = date != null ? ctlRows.findIndex(r => r.date === date) : ctlRows.length - 1;
    if (targetIdx < 0) return null;
    const cur = ctlRows[targetIdx]?.ctl;
    if (cur == null) return null;
    const prevIdx = targetIdx >= 7 ? targetIdx - 7 : 0;
    const prev = ctlRows[prevIdx]?.ctl;
    if (prev == null) return null;
    return cur - prev;
  }

  const ticks: { x: number; label: string }[] = [];
  const cur = new Date(rows[0].date);
  cur.setDate(1);
  cur.setMonth(cur.getMonth() + 1);
  const end = new Date(rows[rows.length - 1].date);
  while (cur <= end) {
    const ms = cur.getTime();
    ticks.push({ x: PAD.left + ((ms - t0) / tRange) * plotW, label: cur.toLocaleDateString("en-GB", { month: "short" }) });
    cur.setMonth(cur.getMonth() + 1);
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0, dist = Infinity;
    rows.forEach((r, i) => { const d = Math.abs(xFor(r.date) - svgX); if (d < dist) { dist = d; closest = i; } });
    setHoverIdx(closest);
  }

  const hovRow = hoverIdx != null ? rows[hoverIdx] : null;
  const hovX = hovRow ? xFor(hovRow.date) : null;
  const delta = ctlDeltaAsOf(hovRow?.date ?? null);

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4, flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="card-title" style={{ margin: 0 }}>Fitness &amp; Fatigue</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700 }}>
              {(hovRow?.ctl ?? latestCtl)?.toFixed(1) ?? "—"}
            </span>
            {delta != null && <DeltaBadge value={delta} size={13} format={(v) => v.toFixed(1)} />}
            <span style={{ fontSize: 11, color: "var(--dim)" }}>{hovRow ? fmtDate(hovRow.date) : "CTL · last 3 months"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="14" height="3" style={{ display: "block" }}><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="var(--accent)" strokeWidth="2.5" /></svg> CTL
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="14" height="3" style={{ display: "block" }}><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="var(--red)" strokeWidth="2.5" /></svg> ATL
          </span>
        </div>
      </div>
      {/* preserveAspectRatio="none" lets the chart fill the row-matched card
          height (see .dashboard-hero-grid) without letterboxing — fine for
          paths (a smooth curve still looks smooth stretched), but it would
          distort circles into ellipses and warp text glyphs. So text/dots are
          rendered as an HTML overlay instead, positioned by the same x/W,
          y/H fractions, immune to the SVG's internal non-uniform scale. */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="ctl-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="atl-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--red)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {atlArea && <path d={atlArea} fill="url(#atl-grad)" />}
          {ctlArea && <path d={ctlArea} fill="url(#ctl-grad)" />}
          {atlLine && <path d={atlLine} fill="none" stroke="var(--red)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {ctlLine && <path d={ctlLine} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}

          {hovX != null && (
            <line x1={hovX} y1={PAD.top} x2={hovX} y2={PAD.top + plotH}
              stroke="var(--muted)" strokeWidth={1} strokeDasharray="3,3" opacity={0.4} vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {ticks.map((t, i) => (
          <span key={i} style={{
            position: "absolute", left: `${(t.x / W) * 100}%`, bottom: 2,
            transform: "translateX(-50%)", fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap",
          }}>
            {t.label}
          </span>
        ))}

        {hovRow && hovX != null && (
          <>
            {hovRow.ctl != null && (
              <span style={{
                position: "absolute", left: `${(hovX / W) * 100}%`, top: `${(yFor(hovRow.ctl) / H) * 100}%`,
                width: 9, height: 9, borderRadius: "50%", background: "var(--accent)",
                border: "2px solid var(--surface)", transform: "translate(-50%, -50%)", pointerEvents: "none",
              }} />
            )}
            {hovRow.atl != null && (
              <span style={{
                position: "absolute", left: `${(hovX / W) * 100}%`, top: `${(yFor(hovRow.atl) / H) * 100}%`,
                width: 9, height: 9, borderRadius: "50%", background: "var(--red)",
                border: "2px solid var(--surface)", transform: "translate(-50%, -50%)", pointerEvents: "none",
              }} />
            )}
            {(() => {
              const parts = [
                hovRow.ctl != null ? `CTL ${hovRow.ctl.toFixed(1)}` : null,
                hovRow.atl != null ? `ATL ${hovRow.atl.toFixed(1)}` : null,
              ].filter(Boolean).join(" · ");
              const text = `${fmtDate(hovRow.date)} · ${parts}`;
              const topY = Math.min(hovRow.ctl != null ? yFor(hovRow.ctl) : Infinity, hovRow.atl != null ? yFor(hovRow.atl) : Infinity);
              const leftPct = (hovX / W) * 100;
              // Clamp horizontally via a CSS transform offset instead of a fixed
              // pixel-width box, so the tooltip never overflows the card on
              // either edge regardless of text length or container width.
              const edgeOffset = leftPct < 15 ? "0%" : leftPct > 85 ? "-100%" : "-50%";
              return (
                <div style={{
                  position: "absolute",
                  left: `${leftPct}%`, top: `${(topY / H) * 100}%`,
                  transform: `translate(${edgeOffset}, calc(-100% - 10px))`,
                  background: "var(--ink)", color: "#fff", fontSize: 11, fontWeight: 700,
                  padding: "4px 9px", borderRadius: 5, whiteSpace: "nowrap", pointerEvents: "none",
                }}>
                  {text}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
