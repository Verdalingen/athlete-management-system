"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/dates";

type Expenditure = { total_calories: number | null };

type Props = { date: string; caloriesEaten: number };

/** Real Garmin burn vs. logged intake for a concluded day — embedded in the Day Summary card
 * alongside the protein/micro scores. Renders nothing for the current day: burn is still
 * accumulating, so a net figure would be misleading until the day is actually over. */
export function DayEnergyBalance({ date, caloriesEaten }: Props) {
  const [burned, setBurned] = useState<number | null>(null);
  const isConcluded = date !== todayISO();

  useEffect(() => {
    if (!isConcluded) {
      setBurned(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/nutrition/expenditure?date=${date}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Expenditure | null) => setBurned(d?.total_calories ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setBurned(null);
      });
    return () => controller.abort();
  }, [date, isConcluded]);

  if (!isConcluded || burned == null) return null;

  const net = caloriesEaten - burned;
  const isSurplus = net > 0;
  const netLabel = Math.abs(net) >= 1
    ? `${isSurplus ? "+" : "-"}${Math.round(Math.abs(net)).toLocaleString("en-US")}`
    : "0";

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 9, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>Burned</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>
          {burned.toLocaleString("en-US")} <span style={{ fontSize: 10, fontWeight: 500, color: "var(--dim)" }}>kcal</span>
        </div>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 8,
        color: isSurplus ? "var(--amber)" : "var(--green)",
        background: isSurplus ? "rgba(var(--amber-rgb),.10)" : "rgba(var(--green-rgb),.10)",
        border: `1px solid ${isSurplus ? "rgba(var(--amber-rgb),.25)" : "rgba(var(--green-rgb),.25)"}`,
      }}>
        {isSurplus ? "▲" : "▼"} {netLabel} kcal
      </span>
    </div>
  );
}
