"use client";

import { useRef, useState } from "react";

type AnalyzedItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  confidence: "high" | "medium" | "low";
  note?: string | null;
  source?: "usda" | "ai_estimate";
  usda_fdc_id?: number;
  usda_description?: string;
  per_100g?: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
};

type Props = {
  meal: string;
  mealLabel: string;
  onLog: (items: AnalyzedItem[]) => Promise<void>;
  onClose: () => void;
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   "var(--green)",
  medium: "var(--amber)",
  low:    "var(--red)",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high:   "High confidence",
  medium: "Estimated",
  low:    "Low confidence — verify",
};

type Phase = "capture" | "preview" | "analyzing" | "results";

export function PhotoFoodCapture({ meal: _meal, mealLabel, onLog, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("capture");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [items, setItems] = useState<AnalyzedItem[]>([]);
  const [mealDesc, setMealDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState(false);

  // ── File selection ────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setPhase("preview");
    setError(null);
  }

  function retake() {
    setPhase("capture");
    setImageUrl(null);
    setImageFile(null);
    setItems([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Analyze ───────────────────────────────────────────────────────────────

  async function analyze() {
    if (!imageFile) return;
    setPhase("analyzing");
    setError(null);

    const form = new FormData();
    form.append("image", imageFile);

    try {
      const res = await fetch("/api/nutrition/vision", { method: "POST", body: form });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setPhase("preview");
        return;
      }

      setItems(
        (data.items ?? []).map((item: AnalyzedItem) => ({
          ...item,
          quantity_g: Math.max(1, Math.round(item.quantity_g)),
          calories:   Math.max(0, Math.round(item.calories)),
          protein_g:  Math.round((item.protein_g ?? 0) * 10) / 10,
          carbs_g:    Math.round((item.carbs_g ?? 0) * 10) / 10,
          fat_g:      Math.round((item.fat_g ?? 0) * 10) / 10,
          fiber_g:    Math.round((item.fiber_g ?? 0) * 10) / 10,
        })),
      );
      setMealDesc(data.meal_description ?? "");
      setPhase("results");
    } catch (err) {
      setError(`Request failed: ${err}`);
      setPhase("preview");
    }
  }

  // ── Edit item fields ──────────────────────────────────────────────────────

  function updateItem(idx: number, field: keyof AnalyzedItem, raw: string) {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (field === "food_name") {
        item.food_name = raw;
      } else {
        const num = parseFloat(raw) || 0;
        // Rescale macros when quantity changes
        if (field === "quantity_g" && item.quantity_g > 0) {
          if (item.per_100g) {
            // USDA-sourced: recalculate from verified per-100g base values
            const scale = num / 100;
            item.calories  = Math.round(item.per_100g.calories  * scale);
            item.protein_g = Math.round(item.per_100g.protein_g * scale * 10) / 10;
            item.carbs_g   = Math.round(item.per_100g.carbs_g   * scale * 10) / 10;
            item.fat_g     = Math.round(item.per_100g.fat_g     * scale * 10) / 10;
            item.fiber_g   = Math.round(item.per_100g.fiber_g   * scale * 10) / 10;
          } else {
            // AI estimate: ratio-based rescaling
            const ratio = num / item.quantity_g;
            item.calories  = Math.round(item.calories  * ratio);
            item.protein_g = Math.round(item.protein_g * ratio * 10) / 10;
            item.carbs_g   = Math.round(item.carbs_g   * ratio * 10) / 10;
            item.fat_g     = Math.round(item.fat_g     * ratio * 10) / 10;
          }
          item.quantity_g = num;
        } else {
          (item as Record<string, unknown>)[field] = num;
        }
      }
      next[idx] = item;
      return next;
    });
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Log ───────────────────────────────────────────────────────────────────

  async function handleLog() {
    if (items.length === 0) return;
    setIsLogging(true);
    try {
      await onLog(items);
    } finally {
      setIsLogging(false);
      onClose();
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const totals = items.reduce(
    (acc, item) => ({
      cal:  acc.cal  + item.calories,
      p:    acc.p    + item.protein_g,
      c:    acc.c    + item.carbs_g,
      f:    acc.f    + item.fat_g,
    }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", width: "100%", maxWidth: 560,
        maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="ti ti-camera" style={{ fontSize: 18, color: "var(--accent)" }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>AI Photo Recognition</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>Adding to {mealLabel}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", color: "var(--muted)", padding: "6px 11px", fontSize: 13 }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* ── Capture phase ─────────────────────────────────────────── */}
          {phase === "capture" && (
            <div style={{ padding: 32, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: "rgba(124,92,255,.12)", border: "2px dashed rgba(124,92,255,.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <i className="ti ti-camera" style={{ fontSize: 34, color: "var(--accent)" }} aria-hidden="true" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Take a photo of your meal</div>
                <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.5 }}>
                  Claude will identify each food item and estimate portion sizes.<br />
                  For best results, include something for scale (plate, utensil, hand).
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  className="btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: 7 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="ti ti-camera" aria-hidden="true" />
                  Take photo
                </button>
                <button
                  className="btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: 7 }}
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.removeAttribute("capture");
                      fileInputRef.current.click();
                      // Restore capture after click
                      setTimeout(() => fileInputRef.current?.setAttribute("capture", "environment"), 500);
                    }
                  }}
                >
                  <i className="ti ti-photo" aria-hidden="true" />
                  Choose from gallery
                </button>
              </div>

              <div style={{ fontSize: 11, color: "var(--dim)", display: "flex", alignItems: "center", gap: 5 }}>
                <i className="ti ti-shield-check" style={{ fontSize: 12 }} aria-hidden="true" />
                Photo is sent to Claude AI and not stored
              </div>
            </div>
          )}

          {/* ── Preview phase ──────────────────────────────────────────── */}
          {(phase === "preview" || phase === "analyzing") && imageUrl && (
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Food photo for analysis"
                  style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }}
                />
                {phase === "analyzing" && (
                  <div style={{
                    position: "absolute", inset: 0, background: "rgba(0,0,0,.55)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                  }}>
                    <i className="ti ti-brain" style={{ fontSize: 32, color: "var(--accent)", animation: "spin 2s linear infinite" }} aria-hidden="true" />
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Analyzing meal…</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)" }}>Identifying foods → verifying with USDA database</div>
                  </div>
                )}
              </div>

              {error && (
                <div className="alert alert-bad">
                  <strong>Could not analyze photo:</strong> {error}
                </div>
              )}

              {phase === "preview" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn-secondary" style={{ flex: 1, gap: 7, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={retake}>
                    <i className="ti ti-camera" aria-hidden="true" />
                    Retake
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
                    onClick={analyze}
                  >
                    <i className="ti ti-brain" aria-hidden="true" />
                    Analyze with AI
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Results phase ──────────────────────────────────────────── */}
          {phase === "results" && (
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Thumbnail + description */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Food" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: "var(--text)" }}>
                    {mealDesc || "Meal identified"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.4 }}>
                    Review and adjust the items below before logging. Quantities auto-rescale macros.
                  </div>
                </div>
              </div>

              {/* Totals bar */}
              <div style={{ background: "rgba(124,92,255,.08)", border: "1px solid rgba(124,92,255,.2)", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 16 }}>
                {[
                  { label: "Total",   val: `${Math.round(totals.cal)} kcal`,  color: "var(--text)" },
                  { label: "Protein", val: `${totals.p.toFixed(1)}g`,          color: "var(--accent)" },
                  { label: "Carbs",   val: `${totals.c.toFixed(1)}g`,          color: "var(--cyan)" },
                  { label: "Fat",     val: `${totals.f.toFixed(1)}g`,          color: "var(--amber)" },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: "center", flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{m.val}</div>
                    <div style={{ fontSize: 9, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Food items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--dim)", fontSize: 13, padding: 16 }}>
                    No food items identified. Try retaking the photo.
                  </div>
                )}

                {items.map((item, idx) => (
                  <div key={idx} style={{
                    background: "rgba(var(--overlay-rgb),.03)", border: "1px solid var(--border)",
                    borderRadius: 10, padding: 12,
                  }}>
                    {/* Name row */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <input
                        className="input"
                        value={item.food_name}
                        onChange={e => updateItem(idx, "food_name", e.target.value)}
                        style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: "6px 10px" }}
                      />
                      {item.source === "usda" ? (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 8, flexShrink: 0,
                          color: "var(--green)", background: "rgba(var(--green-rgb),.12)",
                          border: "1px solid rgba(var(--green-rgb),.3)",
                        }} title={`Matched: ${item.usda_description}`}>
                          ✓ USDA
                        </span>
                      ) : item.source === "ai_estimate" ? (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 8, flexShrink: 0,
                          color: "var(--amber)", background: "rgba(var(--amber-rgb),.1)",
                          border: "1px solid rgba(var(--amber-rgb),.25)",
                        }}>
                          AI est.
                        </span>
                      ) : null}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, flexShrink: 0,
                        color: CONFIDENCE_COLOR[item.confidence] ?? "var(--dim)",
                        background: `${CONFIDENCE_COLOR[item.confidence] ?? "var(--dim)"}18`,
                        border: `1px solid ${CONFIDENCE_COLOR[item.confidence] ?? "var(--dim)"}35`,
                      }}>
                        {CONFIDENCE_LABEL[item.confidence] ?? item.confidence}
                      </span>
                      <button
                        onClick={() => removeItem(idx)}
                        style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 14, padding: "0 2px", flexShrink: 0 }}
                        title="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                    {item.source === "usda" && item.usda_description && item.usda_description.toLowerCase() !== item.food_name.toLowerCase() && (
                      <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 8, paddingLeft: 2 }}>
                        Matched: {item.usda_description}
                      </div>
                    )}

                    {/* Macros row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                      {[
                        { field: "quantity_g", label: "Grams",   color: "var(--muted)" },
                        { field: "calories",   label: "kcal",    color: "var(--text)" },
                        { field: "protein_g",  label: "Protein", color: "var(--accent)" },
                        { field: "carbs_g",    label: "Carbs",   color: "var(--cyan)" },
                        { field: "fat_g",      label: "Fat",     color: "var(--amber)" },
                      ].map(col => (
                        <div key={col.field}>
                          <div style={{ fontSize: 9, color: col.color, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{col.label}</div>
                          <input
                            type="number"
                            min={0}
                            className="input"
                            value={(item as Record<string, unknown>)[col.field] as number}
                            onChange={e => updateItem(idx, col.field as keyof AnalyzedItem, e.target.value)}
                            style={{ padding: "5px 7px", fontSize: 12, fontWeight: 700, color: col.color, textAlign: "center" }}
                          />
                        </div>
                      ))}
                    </div>

                    {item.note && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)", fontStyle: "italic" }}>
                        ℹ {item.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Retake + Log CTA */}
              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button
                  className="btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={retake}
                >
                  <i className="ti ti-camera" aria-hidden="true" />
                  Retake
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 14 }}
                  disabled={items.length === 0 || isLogging}
                  onClick={handleLog}
                >
                  <i className="ti ti-check" aria-hidden="true" />
                  {isLogging ? "Logging…" : `Log ${items.length} item${items.length !== 1 ? "s" : ""} to ${mealLabel}`}
                </button>
              </div>
            </div>
          )}


        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
