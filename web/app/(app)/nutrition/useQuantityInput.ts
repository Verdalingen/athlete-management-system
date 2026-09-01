import { useEffect, useState } from "react";

export type Portion = { label: string; gramWeight: number };

/**
 * Grams are the only state that's ever written directly — the piece "count" is
 * always derived from grams/gramWeight, so editing grams and switching units can
 * never leave a stale or contradictory count on screen.
 */
export function useQuantityInput(initialGrams: number, portions: Portion[]) {
  const [grams, setGrams] = useState(initialGrams);
  const [unitLabel, setUnitLabel] = useState<string | null>(null); // null = grams mode

  // If the active unit disappears (e.g. portions reloaded for a new food), fall back to grams.
  // This is scoped to the same food by QuantityInput's key-based remount (see its docstring) -
  // it only fires for the same food's portions list arriving/changing asynchronously after
  // the initial render, which activePortion's plain derivation below can't detect on its own
  // (it would silently and correctly fall back to null, but unitLabel itself - read directly
  // by QuantityInput's <select> - would keep pointing at a unit that's no longer selectable).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (unitLabel && !portions.some(p => p.label === unitLabel)) setUnitLabel(null);
  }, [portions, unitLabel]);

  const activePortion = portions.find(p => p.label === unitLabel) ?? null;

  // Round to the nearest quarter-unit (handles halves/quarters like "½ avocado")
  // without needing per-food configuration.
  const count = activePortion ? Math.round((grams / activePortion.gramWeight) * 4) / 4 : null;

  function setCount(c: number) {
    if (activePortion) setGrams(Math.max(0, Math.round(activePortion.gramWeight * c)));
  }

  function reset(newGrams: number) {
    setGrams(newGrams);
    setUnitLabel(null);
  }

  return { grams, setGrams, unitLabel, setUnit: setUnitLabel, count, setCount, activePortion, reset };
}
