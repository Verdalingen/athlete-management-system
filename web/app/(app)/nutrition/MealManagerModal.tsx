"use client";

import { useState } from "react";
import { MEAL_CATEGORIES, mealCategoryLabel, type MealCategory, type MealTemplate, type MealDraft } from "./MealBuilderModal";
import { useFormatQty, useUnitSystem } from "./UnitSystemContext";
import { convertTemperaturesInText } from "./format";
import { useT } from "@/lib/i18n/LanguageContext";

type Props = {
  meals: MealTemplate[];
  onUpdate: (meal: MealTemplate) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onBuild: () => void;
  onImportUrl: (draft: MealDraft) => void;
  onLog: (meal: MealTemplate) => void;
  loggingMealId: string | null;
  activeMealLabel?: string;
};

const r1 = (v: number) => Math.round(v * 10) / 10;

export function MealManagerModal({ meals, onUpdate, onDelete, onClose, onBuild, onImportUrl, onLog, loggingMealId, activeMealLabel }: Props) {
  const nt = useT().nutrition;
  const t = nt.mealManager;
  const formatQty = useFormatQty();
  const [unitSystem] = useUnitSystem();
  const [activeCategory, setActiveCategory] = useState<MealCategory | "All">("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<MealCategory>("Other");
  const [editServings, setEditServings] = useState(1);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [portionOverrides, setPortionOverrides] = useState<Record<string, number>>({});

  async function submitImportUrl() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/nutrition/meals/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const body = await res.json();
      if (body.error) { setImportError(body.error); return; }
      onImportUrl(body.draft);
      setImportOpen(false);
      setImportUrl("");
    } catch {
      setImportError(t.importGenericError);
    } finally {
      setImporting(false);
    }
  }

  function startEdit(meal: MealTemplate) {
    setEditing(meal.id);
    setEditName(meal.name);
    setEditCategory(meal.category ?? "Other");
    setEditServings(meal.servings);
    setExpanded(meal.id);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/nutrition/meals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), category: editCategory, servings: editServings }),
      });
      const { meal } = await res.json();
      if (meal) onUpdate(meal);
      setEditing(null);
    } finally {
      setSaving(null);
    }
  }

  async function confirmAndDelete(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/nutrition/meals/${id}`, { method: "DELETE" });
      onDelete(id);
      setConfirmDelete(null);
      if (expanded === id) setExpanded(null);
    } finally {
      setDeleting(null);
    }
  }

  // Which categories actually have meals
  const usedCategories = MEAL_CATEGORIES.filter(c => meals.some(m => (m.category ?? "Other") === c));
  const filterTabs: (MealCategory | "All")[] = usedCategories.length > 1 ? ["All", ...usedCategories] : ["All", ...MEAL_CATEGORIES];

  const visible = activeCategory === "All"
    ? meals
    : meals.filter(m => (m.category ?? "Other") === activeCategory);

  // Group by category for the "All" view
  const grouped: { category: MealCategory; items: MealTemplate[] }[] = activeCategory !== "All"
    ? [{ category: activeCategory, items: visible }]
    : MEAL_CATEGORIES
        .map(cat => ({ category: cat, items: meals.filter(m => (m.category ?? "Other") === cat) }))
        .filter(g => g.items.length > 0);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, paddingTop: 60 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", width: "100%", maxWidth: 620, maxHeight: "calc(100vh - 76px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <i className="ti ti-tools-kitchen-2" style={{ fontSize: 17, color: "var(--amber)" }} aria-hidden="true" />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{t.title}</div>
            <button
              onClick={() => setImportOpen(v => !v)}
              style={{ background: importOpen ? "rgba(124,92,255,.15)" : "none", border: "1px solid var(--border)", color: "var(--accent)", borderRadius: 8, cursor: "pointer", padding: "6px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}
            >
              <i className="ti ti-link" style={{ fontSize: 13 }} aria-hidden="true" />
              {t.importFromUrl}
            </button>
            <button
              onClick={onBuild}
              style={{ background: "rgba(var(--amber-rgb),.12)", border: "1px solid rgba(var(--amber-rgb),.3)", color: "var(--amber)", borderRadius: 8, cursor: "pointer", padding: "6px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}
            >
              <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
              {t.newMeal}
            </button>
            <button onClick={onClose} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", color: "var(--muted)", padding: "5px 10px", fontSize: 13 }}>✕</button>
          </div>

          {importOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  placeholder={t.urlPlaceholder}
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") submitImportUrl(); }}
                  style={{ fontSize: 13, flex: 1 }}
                  autoFocus
                />
                <button className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }} disabled={importing || !importUrl.trim()} onClick={submitImportUrl}>
                  {importing ? nt.actions.fetching : t.importBtn}
                </button>
              </div>
              {importError && <div className="alert alert-bad" style={{ fontSize: 11 }}>{importError}</div>}
            </div>
          )}

          {/* Category filter tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {filterTabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveCategory(tab)}
                style={{
                  flexShrink: 0, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", border: "1px solid",
                  background: activeCategory === tab ? "rgba(var(--amber-rgb),.15)" : "none",
                  borderColor: activeCategory === tab ? "rgba(var(--amber-rgb),.5)" : "var(--border)",
                  color: activeCategory === tab ? "var(--amber)" : "var(--dim)",
                }}
              >
                {tab === "All" ? nt.mealCategories.all : mealCategoryLabel(tab, nt)}
                {tab !== "All" && meals.filter(m => (m.category ?? "Other") === tab).length > 0 &&
                  <span style={{ marginLeft: 5, opacity: 0.7 }}>{meals.filter(m => (m.category ?? "Other") === tab).length}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Meal list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {meals.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🍽</div>
              {t.noMealsYet}
              <div style={{ marginTop: 12 }}>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={onBuild}>{t.buildFirstMeal}</button>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
              {t.noMealsInCategory}
              <div style={{ marginTop: 10 }}>
                <button className="btn-soft" style={{ fontSize: 12 }} onClick={onBuild}>{t.createOne}</button>
              </div>
            </div>
          ) : (
            grouped.map(({ category, items }) => (
              <div key={category}>
                {/* Category section header (only in "All" view with >1 category) */}
                {activeCategory === "All" && grouped.length > 1 && (
                  <div style={{ padding: "10px 18px 4px", fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".08em", borderBottom: "1px solid var(--border)", background: "rgba(var(--overlay-rgb),.02)" }}>
                    {mealCategoryLabel(category, nt)}
                  </div>
                )}
                {items.map(meal => {
                  const totalCal = meal.meal_template_items.reduce((s, i) => s + i.calories, 0);
                  const totalP   = meal.meal_template_items.reduce((s, i) => s + i.protein_g, 0);
                  const totalC   = meal.meal_template_items.reduce((s, i) => s + i.carbs_g, 0);
                  const totalF   = meal.meal_template_items.reduce((s, i) => s + i.fat_g, 0);
                  const srv = Math.max(meal.servings, 1);
                  const ps = { cal: Math.round(totalCal / srv), p: r1(totalP / srv), c: r1(totalC / srv), f: r1(totalF / srv) };
                  const isExpanded = expanded === meal.id;
                  const isEditing = editing === meal.id;
                  const isLogging = loggingMealId === meal.id;

                  return (
                    <div key={meal.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", padding: "12px 18px", gap: 10 }}>
                        {/* Expand toggle */}
                        <button
                          onClick={() => setExpanded(isExpanded ? null : meal.id)}
                          style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 13, padding: "2px 4px", flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .15s" }}
                        >›</button>

                        {/* Name / edit */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input
                                className="input"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                style={{ fontSize: 13, padding: "5px 8px" }}
                                autoFocus
                                onKeyDown={e => { if (e.key === "Enter") saveEdit(meal.id); if (e.key === "Escape") setEditing(null); }}
                              />
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                {MEAL_CATEGORIES.map(cat => (
                                  <button
                                    key={cat}
                                    onClick={() => setEditCategory(cat)}
                                    style={{
                                      padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "1px solid",
                                      background: editCategory === cat ? "rgba(124,92,255,.15)" : "none",
                                      borderColor: editCategory === cat ? "rgba(124,92,255,.4)" : "var(--border)",
                                      color: editCategory === cat ? "var(--accent)" : "var(--dim)",
                                    }}
                                  >{mealCategoryLabel(cat, nt)}</button>
                                ))}
                                <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                                  <span style={{ fontSize: 11, color: "var(--dim)" }}>{nt.mealBuilder.servings}</span>
                                  <input
                                    type="number" min={0.5} step={0.5} className="input"
                                    value={editServings}
                                    onChange={e => setEditServings(parseFloat(e.target.value) || 1)}
                                    style={{ width: 52, fontSize: 12, padding: "5px 6px", textAlign: "center" }}
                                  />
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="btn-primary" style={{ fontSize: 11, padding: "5px 10px" }} disabled={saving === meal.id} onClick={() => saveEdit(meal.id)}>
                                  {saving === meal.id ? "…" : nt.actions.save}
                                </button>
                                <button style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }} onClick={() => setEditing(null)}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{meal.name}</div>
                              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 1 }}>
                                {t.ingredientsCountPlain.replace("{count}", String(meal.meal_template_items.length))}
                                {meal.servings > 1 && <span style={{ color: "var(--amber)" }}> · {t.servingsCount.replace("{count}", String(meal.servings))}</span>}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Macro summary */}
                        {!isEditing && (
                          <div style={{ display: "flex", gap: 10, fontSize: 11, flexShrink: 0 }}>
                            <span style={{ fontWeight: 700 }}>{ps.cal} kcal</span>
                            <span style={{ color: "var(--accent)" }}>{ps.p}g</span>
                            <span style={{ color: "var(--cyan)" }}>{ps.c}g</span>
                            <span style={{ color: "var(--amber)" }}>{ps.f}g</span>
                            {meal.servings > 1 && <span style={{ color: "var(--dim)" }}>/ srv</span>}
                          </div>
                        )}

                        {/* Actions */}
                        {!isEditing && (
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button
                              onClick={() => onLog(meal)}
                              disabled={isLogging || !!loggingMealId}
                              title={activeMealLabel ? t.logServingTo.replace("{meal}", activeMealLabel) : t.logServing}
                              style={{ background: "rgba(var(--amber-rgb),.12)", border: "1px solid rgba(var(--amber-rgb),.3)", color: "var(--amber)", borderRadius: 6, cursor: "pointer", padding: "4px 10px", fontSize: 11, fontWeight: 700, opacity: loggingMealId && !isLogging ? 0.5 : 1 }}
                            >
                              {isLogging ? "…" : t.logBtn}
                            </button>
                            <button onClick={() => startEdit(meal)} title={nt.actions.edit} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--dim)", padding: "4px 8px", fontSize: 12 }}>
                              <i className="ti ti-edit" aria-hidden="true" />
                            </button>
                            {confirmDelete === meal.id ? (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={() => confirmAndDelete(meal.id)} disabled={deleting === meal.id} style={{ background: "rgba(var(--red-rgb),.15)", border: "1px solid rgba(var(--red-rgb),.4)", color: "var(--red)", borderRadius: 6, cursor: "pointer", padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>
                                  {deleting === meal.id ? "…" : nt.actions.delete}
                                </button>
                                <button onClick={() => setConfirmDelete(null)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--dim)", padding: "4px 8px", fontSize: 11 }}>
                                  {nt.actions.cancel}
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(meal.id)} title={nt.actions.delete} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--dim)", padding: "4px 8px", fontSize: 12 }}>
                                <i className="ti ti-trash" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expanded ingredient list */}
                      {isExpanded && (() => {
                        const recipeServings = Math.max(meal.servings, 1);
                        const makingPortions = portionOverrides[meal.id] ?? recipeServings;
                        const scale = makingPortions / recipeServings;
                        const isDefault = makingPortions === recipeServings;
                        return (
                        <div style={{ background: "rgba(var(--overlay-rgb),.02)", borderTop: "1px solid rgba(var(--overlay-rgb),.05)", padding: "8px 18px 12px 44px" }}>
                          {(meal.prep_minutes || meal.source === "imported_url") && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                              {meal.prep_minutes && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", background: "rgba(var(--overlay-rgb),.05)", borderRadius: 12, padding: "2px 9px" }}>
                                  ~{meal.prep_minutes} min
                                </span>
                              )}
                              {meal.source === "imported_url" && meal.source_url && (
                                <a href={meal.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "rgba(124,92,255,.1)", borderRadius: 12, padding: "2px 9px", textDecoration: "none" }}>
                                  {t.importedBadge} <i className="ti ti-external-link" style={{ fontSize: 10, marginLeft: 2 }} aria-hidden="true" />
                                </a>
                              )}
                            </div>
                          )}
                          {meal.description && (
                            <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "pre-line", marginBottom: 10, lineHeight: 1.5 }}>
                              {convertTemperaturesInText(meal.description, unitSystem)}
                            </div>
                          )}

                          {/* Portion scaling — ingredient list below scales to this; logging always uses 1 serving regardless */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: "var(--dim)" }}>{t.making}</span>
                            <input
                              type="number" min={0.5} step={0.5} className="input"
                              value={makingPortions}
                              onChange={e => {
                                const v = parseFloat(e.target.value) || recipeServings;
                                setPortionOverrides(prev => ({ ...prev, [meal.id]: v }));
                              }}
                              style={{ width: 56, fontSize: 12, padding: "4px 6px", textAlign: "center" }}
                            />
                            <span style={{ fontSize: 11, color: "var(--dim)" }}>{t.portionsUnit}</span>
                            {isDefault ? (
                              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--amber)", background: "rgba(var(--amber-rgb),.1)", borderRadius: 12, padding: "2px 9px" }}>
                                {t.intendedAmount}
                              </span>
                            ) : (
                              <button
                                onClick={() => setPortionOverrides(prev => { const next = { ...prev }; delete next[meal.id]; return next; })}
                                style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "none", border: "1px solid var(--border)", borderRadius: 12, padding: "2px 9px", cursor: "pointer" }}
                              >
                                {t.resetToIntended.replace("{count}", String(recipeServings))}
                              </button>
                            )}
                          </div>

                          {meal.meal_template_items.map((item, idx) => (
                            <div key={idx} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: idx < meal.meal_template_items.length - 1 ? "1px solid rgba(var(--overlay-rgb),.04)" : "none", gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.food_name}</div>
                              <div style={{ fontSize: 11, color: "var(--dim)", flexShrink: 0 }}>
                                {formatQty(item.quantity_g * scale, item.serving_qty ? item.serving_qty * scale : item.serving_qty, item.serving_label)}
                              </div>
                              <div style={{ fontSize: 11, flexShrink: 0, display: "flex", gap: 8, marginLeft: 4, paddingLeft: 10, borderLeft: "1px solid var(--border)" }}>
                                <span>{Math.round(item.calories * scale)} kcal</span>
                                <span style={{ color: "var(--accent)" }}>{r1(item.protein_g * scale)}g</span>
                                <span style={{ color: "var(--cyan)" }}>{r1(item.carbs_g * scale)}g</span>
                                <span style={{ color: "var(--amber)" }}>{r1(item.fat_g * scale)}g</span>
                              </div>
                            </div>
                          ))}
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 8, fontSize: 11, fontWeight: 700, borderTop: "1px solid rgba(var(--overlay-rgb),.07)", marginTop: 6 }}>
                            <span style={{ color: "var(--dim)", fontWeight: 400 }}>{isDefault ? t.totalLabel : t.totalWithPortions.replace("{count}", String(makingPortions))}:</span>
                            <span>{Math.round(totalCal * scale)} kcal</span>
                            <span style={{ color: "var(--accent)" }}>{r1(totalP * scale)}g</span>
                            <span style={{ color: "var(--cyan)" }}>{r1(totalC * scale)}g</span>
                            <span style={{ color: "var(--amber)" }}>{r1(totalF * scale)}g</span>
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
