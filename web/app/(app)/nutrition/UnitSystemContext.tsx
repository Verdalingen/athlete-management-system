"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { formatQty as formatQtyBase } from "./format";

export type UnitSystem = "metric" | "imperial";

const STORAGE_KEY = "nutrition-unit-system";

const UnitSystemContext = createContext<[UnitSystem, (u: UnitSystem) => void]>(["metric", () => {}]);

export function UnitSystemProvider({ children }: { children: ReactNode }) {
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>("metric");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "metric" || stored === "imperial") setUnitSystemState(stored);
  }, []);

  const setUnitSystem = useCallback((u: UnitSystem) => {
    setUnitSystemState(u);
    localStorage.setItem(STORAGE_KEY, u);
  }, []);

  return <UnitSystemContext.Provider value={[unitSystem, setUnitSystem]}>{children}</UnitSystemContext.Provider>;
}

export function useUnitSystem() {
  return useContext(UnitSystemContext);
}

/** Bound formatQty that reads the current unit system — call sites don't need to change. */
export function useFormatQty() {
  const [unitSystem] = useUnitSystem();
  return useCallback(
    (quantityG: number, servingQty?: number | null, servingLabel?: string | null) =>
      formatQtyBase(quantityG, servingQty, servingLabel, unitSystem),
    [unitSystem],
  );
}
