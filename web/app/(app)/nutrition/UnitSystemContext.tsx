"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { formatQty as formatQtyBase } from "./format";

export type UnitSystem = "metric" | "imperial";

const STORAGE_KEY = "nutrition-unit-system";

// Same useSyncExternalStore approach as ThemeContext: avoids a post-mount flash of the wrong
// unit system by resolving the real localStorage value synchronously on the client.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): UnitSystem {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "metric" || stored === "imperial" ? stored : "metric";
}
function getServerSnapshot(): UnitSystem {
  return "metric";
}

const UnitSystemContext = createContext<[UnitSystem, (u: UnitSystem) => void]>(["metric", () => {}]);

export function UnitSystemProvider({ children }: { children: ReactNode }) {
  const unitSystem = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setUnitSystem = useCallback((u: UnitSystem) => {
    localStorage.setItem(STORAGE_KEY, u);
    listeners.forEach(cb => cb());
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
