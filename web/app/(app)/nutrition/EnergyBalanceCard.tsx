"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/dates";

type Expenditure = { total_calories: number | null; active_calories: number | null; bmr_calories: number | null };

type Props = { date: string; caloriesEaten: number };

export function EnergyBalanceCard({ date, caloriesEaten }: Props) {
  const [data, setData] = useState<Expenditure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/nutrition/expenditure?date=${date}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        setData(d ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(null);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [date]);

  const burned = data?.total_calories ?? null;
  const active = data?.active_calories ?? null;
  const bmr = data?.bmr_calories ?? null;
  const isToday = date === todayISO();

  const net = burned != null ? caloriesEaten - burned : null;
  const isSurplus = net != null && net > 0;
  const netLabel = net != null && Math.abs(net) >= 1
    ? `${isSurplus ? "+" : ""}${Math.round(net).toLocaleString("en-US")} kcal`
    : null;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>Energy Balance</div>
        {netLabel && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 8,
            color: isSurplus ? "var(--amber)" : "var(--green)",
            background: isSurplus ? "rgba(var(--amber-rgb),.10)" : "rgba(var(--green-rgb),.10)",
            border: `1px solid ${isSurplus ? "rgba(var(--amber-rgb),.25)" : "rgba(var(--green-rgb),.25)"}`,
          }}>
            {isSurplus ? "▲ Surplus" : "▼ Deficit"} {netLabel}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: "var(--dim)", paddingBottom: 4 }}>Loading…</div>
      ) : burned == null ? (
        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
          No Garmin data synced for this day yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>Eaten</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>
                {caloriesEaten.toLocaleString("en-US")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>Burned</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>
                {burned.toLocaleString("en-US")}
              </div>
            </div>
          </div>

          {(active != null || bmr != null) && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
              {active != null ? `${active.toLocaleString("en-US")} active` : ""}
              {active != null && bmr != null ? " + " : ""}
              {bmr != null ? `${bmr.toLocaleString("en-US")} base` : ""}
            </div>
          )}

          {isToday && (
            <div style={{ fontSize: 10, color: "var(--dim)", fontStyle: "italic", marginTop: 4 }}>
              Today&apos;s burn is still accumulating — check back later for the full picture.
            </div>
          )}
        </>
      )}
    </div>
  );
}
