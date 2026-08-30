"use client";

import { useEffect, useRef, useState } from "react";

type WeightEntry = { id: string; date: string; weight_kg: number; source: "manual" | "garmin"; notes?: string | null };

type Props = { date: string };

const RANGES = [
  { days: 14, label: "14d", trendLabel: "2 wk" },
  { days: 30, label: "30d", trendLabel: "30d" },
  { days: 90, label: "90d", trendLabel: "90d" },
] as const;

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Weight trend mini-chart — hoverable so you can read out any previous
 * weigh-in, not just the two endpoint dates. x is time-proportional (not
 * index-based), since a 90-day window with gaps in logging shouldn't bunch
 * entries together as if they were evenly spaced. */
function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (entries.length < 2) return null;

  const W = 280, H = 90;
  const PAD = { top: 10, right: 8, bottom: 4, left: 32 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const vals = entries.map(e => e.weight_kg);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const padV = (maxV - minV || 1) * 0.15;
  const loV = minV - padV, hiV = maxV + padV;
  const spanV = (hiV - loV) || 1;

  const t0 = new Date(entries[0].date).getTime();
  const tEnd = new Date(entries[entries.length - 1].date).getTime();
  const tRange = tEnd - t0 || 1;

  const xFor = (date: string) => PAD.left + ((new Date(date).getTime() - t0) / tRange) * plotW;
  const yFor = (v: number) => PAD.top + plotH - ((v - loV) / spanV) * plotH;

  const pts = entries.map(e => ({ x: xFor(e.date), y: yFor(e.weight_kg) }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0, dist = Infinity;
    entries.forEach((en, i) => {
      const dd = Math.abs(xFor(en.date) - svgX);
      if (dd < dist) { dist = dd; closest = i; }
    });
    setHoverIdx(closest);
  }

  const hov = hoverIdx != null ? entries[hoverIdx] : null;
  const hovX = hov ? xFor(hov.date) : null;
  const hovY = hov ? yFor(hov.weight_kg) : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <text x={PAD.left - 5} y={PAD.top + 3} textAnchor="end" fontSize="8" fill="var(--dim)">{hiV.toFixed(1)}</text>
        <text x={PAD.left - 5} y={PAD.top + plotH} textAnchor="end" fontSize="8" fill="var(--dim)">{loV.toFixed(1)}</text>

        <path d={d} stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 2.5 : 1.5} fill="var(--accent)" opacity={i === pts.length - 1 ? 1 : 0.55} />
        ))}

        {hovX != null && (
          <line x1={hovX} y1={PAD.top} x2={hovX} y2={PAD.top + plotH} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2,2" opacity={0.4} />
        )}
        {hov && hovX != null && hovY != null && (
          <circle cx={hovX} cy={hovY} r={3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
        )}
      </svg>

      {hov && hovX != null && hovY != null && (() => {
        const leftPct = (hovX / W) * 100;
        const edgeOffset = leftPct < 20 ? "0%" : leftPct > 80 ? "-100%" : "-50%";
        return (
          <div style={{
            position: "absolute", left: `${leftPct}%`, top: `${(hovY / H) * 100}%`,
            transform: `translate(${edgeOffset}, calc(-100% - 8px))`,
            background: "var(--ink)", color: "#fff", fontSize: 10, fontWeight: 700,
            padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap", pointerEvents: "none",
          }}>
            {fmtDate(hov.date)} · {hov.weight_kg.toFixed(1)}kg
          </div>
        );
      })()}
    </div>
  );
}

export function WeightCard({ date }: Props) {
  const [rangeDays, setRangeDays] = useState<typeof RANGES[number]["days"]>(14);
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/weight?days=${rangeDays}`)
      .then(r => r.json())
      .then(({ entries: e }) => setEntries(e ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date, rangeDays]);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 30);
  }, [editing]);

  const todayEntry = entries.find(e => e.date === date);
  const prevEntry = entries.findLast(e => e.date < date);

  const trend = entries.length >= 2
    ? entries[entries.length - 1].weight_kg - entries[0].weight_kg
    : null;

  const rangeTrendLabel = RANGES.find(r => r.days === rangeDays)!.trendLabel;
  const trendLabel = trend !== null && Math.abs(trend) > 0.05
    ? `${trend > 0 ? "+" : ""}${trend.toFixed(1)} kg / ${rangeTrendLabel}`
    : null;

  async function save() {
    const kg = parseFloat(inputVal);
    if (!kg || kg <= 0 || kg > 499) return;
    setSaving(true);
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, weight_kg: kg }),
      });
      const { entry } = await res.json();
      if (entry) {
        setEntries(prev => {
          const filtered = prev.filter(e => e.date !== date);
          return [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date));
        });
      }
      setEditing(false);
      setInputVal("");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await fetch(`/api/weight?date=${date}`, { method: "DELETE" });
      setEntries(prev => prev.filter(e => e.date !== date));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>Body Weight</div>
        {trendLabel && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 8,
            color: trend! > 0 ? "var(--amber)" : "var(--green)",
            background: trend! > 0 ? "rgba(var(--amber-rgb),.1)" : "rgba(var(--green-rgb),.1)",
            border: `1px solid ${trend! > 0 ? "rgba(var(--amber-rgb),.25)" : "rgba(var(--green-rgb),.25)"}`,
          }}>
            {trend! > 0 ? "▲" : "▼"} {trendLabel}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: "var(--dim)", paddingBottom: 4 }}>Loading…</div>
      ) : (
        <>
          {/* Current entry or input */}
          {todayEntry && !editing ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
                {todayEntry.weight_kg.toFixed(1)}
              </span>
              <span style={{ fontSize: 12, color: "var(--dim)" }}>kg</span>
              {todayEntry.source === "garmin" && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 6,
                  color: "var(--cyan)", background: "rgba(45,226,230,.1)",
                  border: "1px solid rgba(45,226,230,.25)", lineHeight: 1.4,
                }} title="Synced from Garmin Connect">
                  Garmin
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button
                  onClick={() => { setInputVal(String(todayEntry.weight_kg)); setEditing(true); }}
                  style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 11 }}
                >
                  Edit
                </button>
                <button
                  onClick={remove}
                  disabled={saving}
                  style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 11 }}
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
              <input
                ref={inputRef}
                type="number"
                step="0.1"
                min="20"
                max="499"
                className="input"
                placeholder={prevEntry ? `prev ${prevEntry.weight_kg}` : "kg"}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setInputVal(""); } }}
                style={{ flex: 1, fontSize: 13, padding: "5px 9px" }}
              />
              <button
                className="btn-primary"
                style={{ padding: "5px 12px", fontSize: 12, flexShrink: 0 }}
                onClick={save}
                disabled={saving || !inputVal}
              >
                {saving ? "…" : "Log"}
              </button>
              {editing && (
                <button
                  onClick={() => { setEditing(false); setInputVal(""); }}
                  style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 14 }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Range toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setRangeDays(r.days)}
                style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                  border: `1px solid ${rangeDays === r.days ? "var(--accent)" : "var(--border)"}`,
                  background: rangeDays === r.days ? "rgba(var(--accent-rgb),.12)" : "none",
                  color: rangeDays === r.days ? "var(--accent)" : "var(--dim)",
                  cursor: "pointer",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Trend chart */}
          {entries.length >= 2 && (
            <div style={{ marginTop: 4 }}>
              <WeightChart entries={entries} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--dim)", marginTop: 2 }}>
                <span>{fmtDate(entries[0].date)}</span>
                <span>{fmtDate(entries[entries.length - 1].date)}</span>
              </div>
            </div>
          )}

          {entries.length === 0 && !editing && (
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
              Log your weight daily to track body composition trends.
            </div>
          )}
        </>
      )}
    </div>
  );
}
