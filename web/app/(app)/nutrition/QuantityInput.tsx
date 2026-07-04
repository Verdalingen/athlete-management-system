"use client";

import { useEffect } from "react";
import { useQuantityInput, type Portion } from "./useQuantityInput";

type Props = {
  initialGrams: number;
  portions: Portion[];
  onChange: (grams: number, servingQty: number | null, servingLabel: string | null) => void;
  loading?: boolean;
  compact?: boolean;
};

/**
 * Uncontrolled quantity input: owns its own grams/unit/count state internally and
 * reports every change up via onChange. Pass a `key` from the parent (e.g. the
 * selected food's id) to force a remount — and thus a state reset — whenever the
 * underlying food changes, rather than syncing props into internal state.
 */
export function QuantityInput({ initialGrams, portions, onChange, loading, compact }: Props) {
  const q = useQuantityInput(initialGrams, portions);

  useEffect(() => {
    onChange(q.grams, q.activePortion ? q.count : null, q.activePortion?.label ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.grams, q.unitLabel]);

  const fontSize = compact ? 12 : 13;

  return (
    <div style={{ display: "flex", flexDirection: compact ? "row" : "column", gap: compact ? 6 : 8, alignItems: compact ? "center" : "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          min={0}
          className="input"
          value={q.activePortion ? (q.count ?? 0) : q.grams}
          onChange={e => {
            const v = parseFloat(e.target.value) || 0;
            if (q.activePortion) q.setCount(v);
            else q.setGrams(v);
          }}
          style={compact ? { width: 56, padding: "4px 6px", fontSize, textAlign: "center" } : { fontSize }}
        />
        {!q.activePortion && <span style={{ fontSize: 11, color: "var(--dim)" }}>g</span>}
      </div>

      <select
        className="input"
        value={q.unitLabel ?? ""}
        onChange={e => q.setUnit(e.target.value || null)}
        style={compact ? { width: 92, padding: "4px 6px", fontSize: 11 } : { fontSize }}
      >
        <option value="">Grams</option>
        {portions.map(p => (
          <option key={p.label} value={p.label}>{p.label}</option>
        ))}
        {loading && <option disabled>Loading…</option>}
      </select>

      {q.activePortion && (
        <span style={{ fontSize: 10, color: "var(--dim)" }}>= {Math.round(q.grams)}g</span>
      )}
      {loading && !q.activePortion && (
        <span style={{ fontSize: 10, color: "var(--dim)" }}>Loading portions…</span>
      )}
    </div>
  );
}
