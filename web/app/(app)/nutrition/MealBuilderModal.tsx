"use client";

import { useRef, useState } from "react";
import { QuantityInput } from "./QuantityInput";
import type { Portion } from "./useQuantityInput";

export type MealItem = {
  food_name: string;
  quantity_g: number;
  serving_qty?: number | null;
  serving_label?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  usda_fdc_id?: number | null;
  custom_food_id?: string | null;
  /** Client-side only — USDA portion options for this ingredient's quantity picker. Not persisted. */
  portions?: Portion[];
};

export const MEAL_CATEGORIES = ["Breakfast","Pre-workout","Post-workout","Lunch","Dinner","Snack","Other"] as const;
export type MealCategory = typeof MEAL_CATEGORIES[number];

export type MealTemplate = {
  id: string;
  name: string;
  description?: string | null;
  servings: number;
  category: MealCategory;
  meal_template_items: MealItem[];
  prep_minutes?: number | null;
  source?: "manual" | "ai_generated" | "imported_url" | null;
  source_url?: string | null;
};

type SearchResult = {
  fdcId: number;
  description: string;
  brand?: string | null;
  category?: string | null;
  servingSize?: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  isCustom?: boolean;
  customFoodId?: string;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fat_per_100g?: number;
  fiber_per_100g?: number;
};

export type MealDraft = {
  name?: string;
  category?: MealCategory;
  servings?: number;
  description?: string | null;
  prep_minutes?: number | null;
  source?: "manual" | "ai_generated" | "imported_url";
  source_url?: string | null;
  ingredients?: MealItem[];
};

type Props = {
  onSave: (meal: MealTemplate) => void;
  onClose: () => void;
  /** Pre-fills the builder (e.g. from a URL import) so the user reviews/edits before saving. */
  initial?: MealDraft;
};

const r1 = (v: number) => Math.round(v * 10) / 10;

export function MealBuilderModal({ onSave, onClose, initial }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<MealCategory>(initial?.category ?? "Other");
  const [servings, setServings] = useState(initial?.servings ?? 1);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [prepMinutes, setPrepMinutes] = useState<number | "">(initial?.prep_minutes ?? "");
  const [items, setItems] = useState<MealItem[]>(initial?.ingredients ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline ingredient search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q)}`);
        const { foods } = await res.json();
        setResults(foods ?? []);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  async function addIngredient(food: SearchResult) {
    const qty = food.servingSize ?? 100;
    const scale = qty / 100;
    const cal = food.calories_per_100g ?? food.calories;
    const pro = food.protein_per_100g ?? food.protein;
    const carb = food.carbs_per_100g ?? food.carbs;
    const fat = food.fat_per_100g ?? food.fat;
    const fib = food.fiber_per_100g ?? food.fiber;
    const fdcId = food.isCustom ? null : food.fdcId || null;
    setItems(prev => [...prev, {
      food_name:     food.description,
      quantity_g:    qty,
      calories:      Math.round(cal * scale),
      protein_g:     r1(pro  * scale),
      carbs_g:       r1(carb * scale),
      fat_g:         r1(fat  * scale),
      fiber_g:       r1(fib  * scale),
      usda_fdc_id:   fdcId,
      custom_food_id: food.customFoodId ?? null,
    }]);
    setQuery("");
    setResults([]);

    if (fdcId) {
      try {
        const res = await fetch(`/api/nutrition/food-details?ids=${fdcId}`);
        const { foods } = await res.json() as { foods?: Array<{ fdcId: number; portions?: Portion[] }> };
        const portions = foods?.[0]?.portions ?? [];
        if (portions.length) {
          setItems(prev => prev.map(it => (it.usda_fdc_id === fdcId && !it.portions ? { ...it, portions } : it)));
        }
      } catch { /* non-fatal — grams-only for this ingredient */ }
    }
  }

  function updateQty(idx: number, newQty: number, servingQty?: number | null, servingLabel?: string | null) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const ratio = newQty / (item.quantity_g || 1);
      return {
        ...item,
        quantity_g: newQty,
        serving_qty: servingQty ?? null,
        serving_label: servingLabel ?? null,
        calories:   Math.round(item.calories  * ratio),
        protein_g:  r1(item.protein_g * ratio),
        carbs_g:    r1(item.carbs_g   * ratio),
        fat_g:      r1(item.fat_g     * ratio),
        fiber_g:    r1(item.fiber_g   * ratio),
      };
    }));
  }

  const totals = items.reduce((acc, item) => ({
    cal: acc.cal + item.calories,
    p:   acc.p   + item.protein_g,
    c:   acc.c   + item.carbs_g,
    f:   acc.f   + item.fat_g,
  }), { cal: 0, p: 0, c: 0, f: 0 });

  const perServing = {
    cal: Math.round(totals.cal / (servings || 1)),
    p:   r1(totals.p / (servings || 1)),
    c:   r1(totals.c / (servings || 1)),
    f:   r1(totals.f / (servings || 1)),
  };

  async function save() {
    if (!name.trim()) { setError("Meal name is required."); return; }
    if (items.length === 0) { setError("Add at least one ingredient."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/nutrition/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          servings,
          description: description.trim() || null,
          prep_minutes: prepMinutes === "" ? null : prepMinutes,
          source: initial?.source ?? "manual",
          source_url: initial?.source_url ?? null,
          items: items.map(({ portions: _portions, ...item }) => item),
        }),
      });
      const body = await res.json();
      if (body.error) {
        const detail = [body.error, body.code && `(${body.code})`, body.hint, body.details].filter(Boolean).join(" — ");
        setError(detail);
        return;
      }
      const { meal } = body;
      onSave(meal);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", width: "100%", maxWidth: 580, maxHeight: "calc(100vh - 76px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="ti ti-tools-kitchen-2" style={{ fontSize: 17, color: "var(--accent)" }} aria-hidden="true" />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Build a meal</div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", color: "var(--muted)", padding: "5px 10px", fontSize: 13 }}>✕</button>
        </div>

        {/* Meal name + servings */}
        <div style={{ padding: "14px 18px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">Meal name *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Post-workout shake, Standard lunch…" autoFocus />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">Servings</label>
            <input type="number" min={1} step={0.5} className="input" value={servings} onChange={e => setServings(parseFloat(e.target.value) || 1)} style={{ width: 64 }} />
          </div>
        </div>

        {/* Instructions + prep time */}
        <div style={{ padding: "10px 18px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">Instructions (optional)</label>
            <textarea
              className="textarea"
              style={{ minHeight: 60, fontSize: 12 }}
              placeholder={"e.g. 1. Season chicken and pan-sear 6 min per side.\n2. Rest 5 min, slice, serve over rice."}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">Prep (min)</label>
            <input
              type="number" min={1} className="input" style={{ width: 64 }}
              value={prepMinutes}
              onChange={e => setPrepMinutes(e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            />
          </div>
        </div>

        {/* Category */}
        <div style={{ padding: "0 18px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Category</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MEAL_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: "4px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid",
                  background: category === cat ? "rgba(124,92,255,.15)" : "none",
                  borderColor: category === cat ? "rgba(124,92,255,.5)" : "var(--border)",
                  color: category === cat ? "var(--accent)" : "var(--dim)",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Ingredient search */}
        <div style={{ padding: "12px 18px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>Add ingredient</div>
          <input
            className="input"
            placeholder="Search foods…"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            style={{ fontSize: 13 }}
          />
          {(results.length > 0 || searching) && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: "auto", background: "var(--surface)" }}>
              {searching && <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--dim)" }}>Searching…</div>}
              {results.map((food, idx) => (
                <div
                  key={food.fdcId ? `usda-${food.fdcId}` : `off-${idx}`}
                  onClick={() => addIngredient(food)}
                  style={{ display: "flex", alignItems: "center", padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid rgba(var(--overlay-rgb),.04)", gap: 10 }}
                  className="ntr-search-row"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{food.description}</div>
                    <div style={{ fontSize: 10, color: "var(--dim)" }}>{food.brand ?? food.category ?? "Generic"}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--dim)", flexShrink: 0 }}>
                    {food.calories} kcal · P{food.protein}g / 100g
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ingredients list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--dim)", fontSize: 13, padding: "24px 0" }}>
              Search above to add ingredients
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 2 }}>
                Ingredients ({items.length})
              </div>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(var(--overlay-rgb),.03)", borderRadius: 8, padding: "8px 10px", border: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.food_name}</div>
                    <div style={{ fontSize: 10, color: "var(--dim)" }}>
                      {item.calories} kcal · P{item.protein_g}g · C{item.carbs_g}g · F{item.fat_g}g
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <QuantityInput
                      key={idx}
                      compact
                      initialGrams={item.quantity_g}
                      portions={item.portions ?? []}
                      onChange={(g, sQty, sLabel) => updateQty(idx, g, sQty, sLabel)}
                    />
                  </div>
                  <button
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 16, padding: "0 2px", flexShrink: 0 }}
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Totals + save */}
        {items.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Macro summary */}
            <div style={{ background: "rgba(124,92,255,.07)", borderRadius: 10, padding: "8px 14px", display: "flex", gap: 0 }}>
              {[
                { label: servings > 1 ? "Per serving" : "Total", val: `${perServing.cal} kcal`, color: "var(--text)" },
                { label: "Protein", val: `${perServing.p}g`, color: "var(--accent)" },
                { label: "Carbs",   val: `${perServing.c}g`, color: "var(--cyan)" },
                { label: "Fat",     val: `${perServing.f}g`, color: "var(--amber)" },
              ].map(m => (
                <div key={m.label} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 9, color: "var(--dim)" }}>{m.label}</div>
                </div>
              ))}
              {servings > 1 && (
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--dim)" }}>{totals.cal}</div>
                  <div style={{ fontSize: 9, color: "var(--dim)" }}>Total kcal</div>
                </div>
              )}
            </div>

            {error && <div className="alert alert-bad">{error}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className="btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save meal"}
              </button>
            </div>
          </div>
        )}

        {items.length === 0 && error && (
          <div style={{ padding: "0 18px 14px" }}>
            <div className="alert alert-bad">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
