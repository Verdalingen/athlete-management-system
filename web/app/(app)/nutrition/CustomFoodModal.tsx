"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/LanguageContext";

export type CustomFood = {
  id: string;
  name: string;
  brand?: string | null;
  serving_size_g: number;
  serving_unit?: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
  sugar_per_100g: number;
  sodium_per_100mg: number;
};

type FormState = Omit<CustomFood, "id">;

const EMPTY: FormState = {
  name: "", brand: "", serving_size_g: 100, serving_unit: "g",
  calories_per_100g: 0, protein_per_100g: 0, carbs_per_100g: 0,
  fat_per_100g: 0, fiber_per_100g: 0, sugar_per_100g: 0, sodium_per_100mg: 0,
};

type Props = {
  editFood?: CustomFood | null;
  onSave: (food: CustomFood) => void;
  onClose: () => void;
};

export function CustomFoodModal({ editFood, onSave, onClose }: Props) {
  const nt = useT().nutrition;
  const t = nt.customFoodModal;
  const ml = nt.macroLabels;
  const [form, setForm] = useState<FormState>(editFood ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof FormState, v: string) =>
    setForm(prev => ({ ...prev, [k]: typeof EMPTY[k] === "number" ? parseFloat(v) || 0 : v }));

  const serving = form.serving_size_g > 0 ? form.serving_size_g / 100 : 1;

  async function save() {
    if (!form.name.trim()) { setError(t.nameRequired); return; }
    if (form.calories_per_100g <= 0) { setError(t.caloriesRequired); return; }
    setSaving(true);
    setError(null);
    try {
      const url = editFood
        ? `/api/nutrition/custom-foods/${editFood.id}`
        : "/api/nutrition/custom-foods";
      const res = await fetch(url, {
        method: editFood ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          brand: form.brand?.trim() || null,
          serving_size_g: form.serving_size_g,
          serving_unit: form.serving_unit?.trim() || "g",
          calories_per_100g: form.calories_per_100g,
          protein_per_100g: form.protein_per_100g,
          carbs_per_100g: form.carbs_per_100g,
          fat_per_100g: form.fat_per_100g,
          fiber_per_100g: form.fiber_per_100g,
          sugar_per_100g: form.sugar_per_100g,
          sodium_per_100mg: form.sodium_per_100mg,
        }),
      });
      const { food, error: apiErr } = await res.json();
      if (apiErr) { setError(apiErr); return; }
      onSave(food);
    } finally {
      setSaving(false);
    }
  }

  const r1 = (v: number) => Math.round(v * 10) / 10;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", width: "100%", maxWidth: 480,
        maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="ti ti-salad" style={{ fontSize: 17, color: "var(--accent)" }} aria-hidden="true" />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
            {editFood ? t.editTitle : t.createTitle}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", color: "var(--muted)", padding: "5px 10px", fontSize: 13 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Name + brand */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">{t.foodName}</label>
              <input className="input" value={form.name} onChange={e => set("name", e.target.value)} placeholder={t.foodNamePlaceholder} autoFocus />
            </div>
            <div className="field">
              <label className="field-label">{t.brand}</label>
              <input className="input" value={form.brand ?? ""} onChange={e => set("brand", e.target.value)} placeholder={t.optionalPlaceholder} />
            </div>
            <div className="field">
              <label className="field-label">{t.servingSize}</label>
              <input type="number" min={1} className="input" value={form.serving_size_g} onChange={e => set("serving_size_g", e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">{t.pieceName}</label>
              <input
                className="input"
                value={form.serving_unit === "g" ? "" : form.serving_unit ?? ""}
                onChange={e => set("serving_unit", e.target.value)}
                placeholder={t.pieceNamePlaceholder}
              />
            </div>
          </div>

          {/* Per-100g macros */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
              {t.macrosPer100g}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                { key: "calories_per_100g", label: ml.calories, unit: "kcal", color: "var(--text)" },
                { key: "protein_per_100g",  label: ml.protein,  unit: "g",    color: "var(--accent)" },
                { key: "carbs_per_100g",    label: ml.carbs,    unit: "g",    color: "var(--cyan)" },
                { key: "fat_per_100g",      label: ml.fat,      unit: "g",    color: "var(--amber)" },
              ].map(col => (
                <div key={col.key} className="field">
                  <label className="field-label" style={{ color: col.color }}>{col.label}</label>
                  <input type="number" min={0} step="0.1" className="input"
                    value={(form as Record<string, number | string>)[col.key]}
                    onChange={e => set(col.key as keyof FormState, e.target.value)}
                    style={{ color: col.color, fontWeight: 700, textAlign: "center" }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Secondary macros */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { key: "fiber_per_100g",   label: ml.fiber,   unit: "g/100g" },
              { key: "sugar_per_100g",   label: ml.sugar,   unit: "g/100g" },
              { key: "sodium_per_100mg", label: ml.sodium,  unit: "mg/100g" },
            ].map(col => (
              <div key={col.key} className="field">
                <label className="field-label">{col.label} <span style={{ fontWeight: 400 }}>({col.unit})</span></label>
                <input type="number" min={0} step="0.1" className="input"
                  value={(form as Record<string, number | string>)[col.key]}
                  onChange={e => set(col.key as keyof FormState, e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Per-serving preview */}
          {form.serving_size_g !== 100 && (
            <div style={{ background: "rgba(124,92,255,.06)", border: "1px solid rgba(124,92,255,.2)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
                {t.perServing.replace("{size}", String(form.serving_size_g))}
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {[
                  { label: ml.cal,     val: Math.round(form.calories_per_100g * serving), color: "var(--text)" },
                  { label: ml.protein, val: r1(form.protein_per_100g * serving),            color: "var(--accent)" },
                  { label: ml.carbs,   val: r1(form.carbs_per_100g * serving),              color: "var(--cyan)" },
                  { label: ml.fat,     val: r1(form.fat_per_100g * serving),                color: "var(--amber)" },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{m.val}</div>
                    <div style={{ fontSize: 9, color: "var(--dim)" }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="alert alert-bad">{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>{nt.actions.cancel}</button>
          <button className="btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
            {saving ? nt.actions.saving : editFood ? t.saveChanges : t.createFood}
          </button>
        </div>
      </div>
    </div>
  );
}
