export type Portion = { label: string; gramWeight: number };

type RawFoodPortion = {
  gramWeight: number;
  amount?: number;
  modifier?: string;
  measureUnit?: { name: string };
};

/**
 * Turn USDA's `foodPortions` array (only present on format=full responses) into a
 * de-duplicated "1 unit = Xg" list. USDA's `amount` is usually 1.0 but isn't always,
 * so we normalise gramWeight/amount to a true per-unit weight.
 */
export function extractPortions(raw: { foodPortions?: RawFoodPortion[] }): Portion[] {
  const out = new Map<string, Portion>();
  for (const p of raw.foodPortions ?? []) {
    if (!p.gramWeight || p.gramWeight <= 0) continue;
    const amount = p.amount && p.amount > 0 ? p.amount : 1;
    const label = (
      p.measureUnit?.name && p.measureUnit.name.toLowerCase() !== "undetermined"
        ? p.measureUnit.name
        : p.modifier
    )?.trim();
    if (!label) continue;
    const gramWeight = Math.round((p.gramWeight / amount) * 100) / 100;
    const key = label.toLowerCase();
    if (!out.has(key)) out.set(key, { label, gramWeight });
  }
  return Array.from(out.values());
}
