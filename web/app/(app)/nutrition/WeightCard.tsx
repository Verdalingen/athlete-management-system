"use client";

import { useEffect, useRef, useState } from "react";

type WeightEntry = { id: string; date: string; weight_kg: number; source: "manual" | "garmin"; notes?: string | null };

type Props = { date: string };

const RANGES = [
  { days: 14, label: "14d", trendLabel: "2 wk" },
  { days: 30, label: "30d", trendLabel: "30d" },
  { days: 90, label: "90d", trendLabel: "90d" },
] as const;

function Sparkline({ entries }: { entries: WeightEntry[] }) {
  if (entries.length < 2) return null;

  const vals = entries.map(e => e.weight_kg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 200, H = 36, PAD = 3;

  const pts = entries.map((e, i) => {
    const x = PAD + (i / (entries.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((e.weight_kg - min) / range) * (H - PAD * 2);
    return [x, y] as [number, number];
  });

  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
      <path d={d} stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="3" fill="var(--accent)" />
    </svg>
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

          {/* Sparkline */}
          {entries.length >= 2 && (
            <div style={{ marginTop: 4, opacity: 0.85 }}>
              <Sparkline entries={entries} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--dim)", marginTop: 2 }}>
                <span>{entries[0].date.slice(5)}</span>
                <span>{entries[entries.length - 1].date.slice(5)}</span>
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
