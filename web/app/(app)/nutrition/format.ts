function pluralize(label: string): string {
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
