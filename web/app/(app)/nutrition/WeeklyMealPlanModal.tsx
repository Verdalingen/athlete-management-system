"use client";

import { useEffect, useState } from "react";
import { formatShort, formatWeekday, todayISO } from "@/lib/dates";
import { formatWeight } from "./format";
import { useFormatQty, useUnitSystem } from "./UnitSystemContext";

type Ingredient = {
  food_name: string; shopping_name?: string | null; quantity_g: number;
  serving_qty?: number | null; serving_label?: string | null;
  calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
};

type MealRecommendation = {
  id?: string;
  date: string;
  meal_type: string;
  name: string;
  description?: string | null;
  ingredients: Ingredient[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  micros?: Record<string, number>;
};

const MEAL_ORDER = ["breakfast", "pre_workout", "lunch", "post_workout", "dinner", "snacks"];
const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast", pre_workout: "Pre-Workout", lunch: "Lunch",
  post_workout: "Post-Workout", dinner: "Dinner", snacks: "Snacks",
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Normalise an ingredient name for shopping-list grouping so trivial variants across
// different days' recommendations (e.g. "banana" vs "Bananas", "egg" vs "eggs")
// collapse into one line — naive singularisation, skips words where stripping a
// trailing "s" would mangle them (hummus, asparagus, couscous, ...).
function shoppingListKey(name: string): string {
  const t = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (t.length > 3 && t.endsWith("s") && !/(ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

type Props = {
  onClose: () => void;
  onLog: (rec: MealRecommendation, targetDate?: string) => Promise<unknown>;
};

export function WeeklyMealPlanModal({ onClose, onLog }: Props) {
  const formatQty = useFormatQty();
  const [unitSystem] = useUnitSystem();
  const start = todayISO();
  const end = addDays(start, 6);
  const dateRange = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const [recs, setRecs] = useState<MealRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [loggedKeys, setLoggedKeys] = useState<Set<string>>(new Set());
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [showShoppingList, setShowShoppingList] = useState(false);

  // load() was only ever called from this one mount effect (no retry button reuses it), so
  // the useCallback indirection was pure overhead - inlined directly.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/nutrition/meal-recommendations?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(json => { if (json.error) setError(json.error); else setRecs(json.data ?? []); })
      .catch(() => setError("Failed to load meal plan"))
      .finally(() => setLoading(false));
  }, [start, end]);

  async function planWeek() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/nutrition/meal-recommendations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: start, days: 7 }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setRecs(json.data ?? []);
      setLoggedKeys(new Set());
    } finally {
      setGenerating(false);
    }
  }

  async function handleLog(rec: MealRecommendation) {
    const key = `${rec.date}-${rec.meal_type}`;
    await onLog(rec, rec.date);
    setLoggedKeys(prev => new Set(prev).add(key));
  }

  const byDate = new Map<string, MealRecommendation[]>();
  for (const r of recs) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  // Aggregate a shopping list across every recommendation in the visible week —
  // same ingredient across different meals/days becomes one line with a summed quantity.
  // Uses shopping_name (the generic buyable item — "Cod" not "Baked cod fillet") when
  // available, falling back to food_name for recommendations generated before that
  // field existed.
  const shoppingList = (() => {
    const agg = new Map<string, { name: string; grams: number }>();
    for (const r of recs) {
      for (const item of r.ingredients ?? []) {
        const baseName = item.shopping_name || item.food_name;
        const key = shoppingListKey(baseName);
        const existing = agg.get(key);
        if (existing) existing.grams += item.quantity_g;
        else agg.set(key, { name: baseName.trim().toLowerCase(), grams: item.quantity_g });
      }
    }
    return Array.from(agg.values())
      .map(item => ({ ...item, grams: Math.round(item.grams) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, paddingTop: 60 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", width: "100%", maxWidth: 680, maxHeight: "calc(100vh - 76px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="ti ti-calendar-week" style={{ fontSize: 17, color: "var(--accent)" }} aria-hidden="true" />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Weekly Meal Plan</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatShort(start)} – {formatShort(end)}</div>
          <button
            className="btn-soft"
            style={{ fontSize: 11, padding: "5px 10px" }}
            onClick={planWeek}
            disabled={generating}
          >
            {generating ? "Planning…" : recs.length ? "Regenerate week" : "Plan this week"}
          </button>
          <button onClick={onClose} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", color: "var(--muted)", padding: "5px 10px", fontSize: 13 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, padding: "10px 18px 0" }}>
          <button
            onClick={() => setShowShoppingList(false)}
            style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid", background: !showShoppingList ? "rgba(124,92,255,.15)" : "none", borderColor: !showShoppingList ? "rgba(124,92,255,.5)" : "var(--border)", color: !showShoppingList ? "var(--accent)" : "var(--dim)" }}
          >
            Days
          </button>
          <button
            onClick={() => setShowShoppingList(true)}
            style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid", background: showShoppingList ? "rgba(124,92,255,.15)" : "none", borderColor: showShoppingList ? "rgba(124,92,255,.5)" : "var(--border)", color: showShoppingList ? "var(--accent)" : "var(--dim)" }}
          >
            Shopping list{shoppingList.length > 0 && <span style={{ marginLeft: 5, opacity: 0.7 }}>{shoppingList.length}</span>}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "var(--dim)", fontSize: 13, padding: 40 }}>Loading…</div>
          ) : error ? (
            <div style={{ textAlign: "center", color: "var(--red)", fontSize: 13, padding: 40 }}>{error}</div>
          ) : recs.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--dim)", fontSize: 13, padding: 40 }}>
              No meal plan generated for this week yet.
              <div style={{ marginTop: 12 }}>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={planWeek} disabled={generating}>
                  {generating ? "Planning…" : "Plan this week"}
                </button>
              </div>
            </div>
          ) : showShoppingList ? (
            <div>
              {shoppingList.map(item => {
                const isChecked = checkedItems.has(item.name);
                return (
                  <label
                    key={item.name}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid rgba(var(--overlay-rgb),.05)", cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => setCheckedItems(prev => {
                        const next = new Set(prev);
                        if (next.has(item.name)) next.delete(item.name); else next.add(item.name);
                        return next;
                      })}
                    />
                    <span style={{ flex: 1, fontSize: 13, textTransform: "capitalize", textDecoration: isChecked ? "line-through" : "none", color: isChecked ? "var(--dim)" : "var(--text)" }}>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--dim)" }}>
                      {unitSystem === "metric" && item.grams >= 1000 ? `${(item.grams / 1000).toFixed(1)}kg` : formatWeight(item.grams, unitSystem)}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            dateRange.map(d => {
              const dayMeals = (byDate.get(d) ?? []).slice().sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));
              const isDayCollapsed = collapsedDays.has(d);
              return (
                <div key={d} style={{ marginBottom: 18 }}>
                  <button
                    onClick={() => setCollapsedDays(prev => { const next = new Set(prev); if (next.has(d)) next.delete(d); else next.add(d); return next; })}
                    style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: isDayCollapsed ? 0 : 8 }}
                  >
                    <i
                      className="ti ti-chevron-right"
                      aria-hidden="true"
                      style={{ fontSize: 13, color: "var(--dim)", transform: isDayCollapsed ? "none" : "rotate(90deg)", transition: "transform .15s", flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: d === todayISO() ? "var(--accent)" : "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                      {formatWeekday(d)} {formatShort(d)} {d === todayISO() && "· Today"}
                    </span>
                    {isDayCollapsed && dayMeals.length > 0 && (
                      <span style={{ fontSize: 11, color: "var(--dim)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                        {dayMeals.length} meal{dayMeals.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                  {isDayCollapsed ? null : dayMeals.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--dim)", paddingBottom: 4 }}>No meals planned.</div>
                  ) : (
                    dayMeals.map(rec => {
                      const key = `${rec.date}-${rec.meal_type}`;
                      const isExpanded = expanded.has(key);
                      const isLogged = loggedKeys.has(key);
                      return (
                        <div key={key} style={{ background: "rgba(124,92,255,.05)", border: "1px solid rgba(124,92,255,.12)", borderRadius: "var(--radius)", padding: "8px 12px", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button
                              onClick={() => setExpanded(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                              title={isExpanded ? "Collapse ingredients" : "Expand ingredients"}
                              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 16, padding: "8px 10px 8px 4px", margin: "-8px 0 -8px -4px", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .15s", lineHeight: 1, flexShrink: 0 }}
                            >›</button>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".04em", flexShrink: 0, width: 78 }}>
                              {MEAL_LABELS[rec.meal_type] ?? rec.meal_type}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{rec.name}</span>
                            <span style={{ fontSize: 10, color: "var(--dim)", flexShrink: 0 }}>{rec.calories} kcal</span>
                            <button
                              className="btn-soft"
                              style={{ fontSize: 10, padding: "3px 9px", flexShrink: 0, opacity: isLogged ? 0.6 : 1 }}
                              onClick={() => handleLog(rec)}
                            >
                              {isLogged ? "Logged ✓" : "Use recommended"}
                            </button>
                          </div>
                          {rec.description && (
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, marginLeft: 21 }}>{rec.description}</div>
                          )}
                          {isExpanded && (
                            <div style={{ marginTop: 6, marginLeft: 21, paddingTop: 6, borderTop: "1px solid rgba(124,92,255,.1)" }}>
                              {rec.ingredients.map((item, idx) => (
                                <div key={idx} style={{ display: "flex", alignItems: "center", padding: "3px 0", gap: 8, fontSize: 11 }}>
                                  <div style={{ flex: 1, minWidth: 0, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.food_name}</div>
                                  <div style={{ color: "var(--dim)", flexShrink: 0 }}>{formatQty(item.quantity_g, item.serving_qty, item.serving_label)}</div>
                                  <div style={{ flexShrink: 0, fontWeight: 600 }}>{item.calories} kcal</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
