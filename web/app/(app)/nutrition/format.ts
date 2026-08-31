// Abbreviations don't take an "s" in normal usage ("2 tbsp", never "2 tbsps").
const NO_PLURAL = new Set(["tbsp", "tsp", "oz", "ml", "g", "kg", "lb", "pt", "qt", "gal"]);

function pluralize(label: string): string {
  if (NO_PLURAL.has(label.toLowerCase())) return label;
  return /[sx]$/.test(label) ? `${label}es` : `${label}s`;
}

const OZ_IN_G = 28.3495;

/** Exact weight conversion (g <-> oz/lb) — no per-ingredient density guessing. */
export function formatWeight(grams: number, unitSystem: "metric" | "imperial" = "metric"): string {
  if (unitSystem === "metric") return `${Math.round(grams)}g`;
  const totalOz = grams / OZ_IN_G;
  if (totalOz < 16) {
    const rounded = Math.round(totalOz * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}oz`;
  }
  let lb = Math.floor(totalOz / 16);
  let oz = Math.round(totalOz - lb * 16);
  if (oz === 16) { lb += 1; oz = 0; }
  return oz === 0 ? `${lb}lb` : `${lb}lb ${oz}oz`;
}

/** "2 slices (56g)" when a natural unit is known, else plain "56g" (or the imperial equivalent). */
export function formatQty(
  quantityG: number,
  servingQty?: number | null,
  servingLabel?: string | null,
  unitSystem: "metric" | "imperial" = "metric",
): string {
  if (servingQty && servingLabel) {
    const qtyStr = Number.isInteger(servingQty) ? String(servingQty) : servingQty.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    const label = servingQty === 1 ? servingLabel : pluralize(servingLabel);
    return `${qtyStr} ${label} (${formatWeight(quantityG, unitSystem)})`;
  }
  return formatWeight(quantityG, unitSystem);
}

// Matches "350°F", "350 °F", "350F", "180°C", "350 degrees F", "180 degrees Celsius".
// The bare single-letter form is deliberately case-sensitive (F/C only, not f/c) —
// lowercase "c" after a number is too likely to be something else in free text.
const TEMP_RE = /(\d+(?:\.\d+)?)\s*°?\s*(?:degrees?\s+)?(Fahrenheit|fahrenheit|Celsius|celsius|F|C)\b/g;

/**
 * Converts temperature mentions in free-text recipe instructions to the given
 * unit system. Instructions are unstructured prose (no separate stored value
 * per mention), so this runs as a render-time text transform rather than a
 * one-time conversion baked in at import — it stays correct if the user's
 * unit preference changes later, the same way formatQty/formatWeight do for
 * ingredient quantities.
 */
export function convertTemperaturesInText(text: string, unitSystem: "metric" | "imperial"): string {
  const targetUnit = unitSystem === "metric" ? "C" : "F";
  return text.replace(TEMP_RE, (match, valueStr: string, unitWord: string) => {
    const value = parseFloat(valueStr);
    const sourceUnit = unitWord[0].toUpperCase() === "F" ? "F" : "C";
    if (sourceUnit === targetUnit) return match;
    const converted = sourceUnit === "F" ? (value - 32) * 5 / 9 : value * 9 / 5 + 32;
    return `${Math.round(converted)}°${targetUnit}`;
  });
}
