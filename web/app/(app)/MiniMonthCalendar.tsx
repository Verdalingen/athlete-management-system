"use client";

import { useState } from "react";
import type { StrengthSession } from "@/lib/types";
import type { WeightRecommendation } from "@/lib/strength";
import { SessionDetailModal, type DayData } from "./SessionDetailModal";
import { SESSION_LABEL, SESSION_COLOR } from "@/lib/session-theme";
import { MONTH_NAMES, DAY_HEADERS, buildMonthCells } from "@/lib/calendar";

const CIRCLE = 34;

/** Dashboard's calendar widget — a single month, circular day numbers, no
 * bordered boxes per day (per the Tripper reference: "I particularly like
 * the minimalism of the calendar view, and the circle around the numbers").
 * Distinct from PlanCalendar's full-season boxed-cell view, which stays as
 * the detailed version on /plan. */
export function MiniMonthCalendar({
  dayMap, strengthMap, today, bench1RMKg, weightRecommendations,
}: {
  dayMap: Record<string, DayData>;
  strengthMap: Record<string, StrengthSession>;
  today: string;
  bench1RMKg?: number | null;
  weightRecommendations?: Record<string, WeightRecommendation>;
}) {
  const todayDate = new Date(today + "T00:00:00");
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const cells = buildMonthCells(viewYear, viewMonth);
  const selected = selectedDate ? dayMap[selectedDate] ?? null : null;
  const selectedStrength = selectedDate ? strengthMap[selectedDate] ?? null : null;

  function changeMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function toggle(iso: string) {
    if (!dayMap[iso]) return;
    setSelectedDate(prev => prev === iso ? null : iso);
  }

  const presentTypes = [...new Set(
    Object.values(dayMap).filter(d => !d.is_rest).map(d => d.session_type)
  )];

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, display: "flex" }}
        >
          <i className="ti ti-chevron-left" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
        <div className="card-title" style={{ margin: 0 }}>{MONTH_NAMES[viewMonth]} {viewYear}</div>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, display: "flex" }}
        >
          <i className="ti ti-chevron-right" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {DAY_HEADERS.map(h => (
          <div key={h} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--dim)", paddingBottom: 6 }}>
            {h[0]}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell.iso) return <div key={i} />;
          const d = dayMap[cell.iso];
          const isToday = cell.iso === today;
          const hasSession = d && !d.is_rest;
          const dotColor = hasSession ? (d.completedActivities?.length ? "var(--green)" : (SESSION_COLOR[d.session_type] ?? "var(--dim)")) : null;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => toggle(cell.iso!)}
              disabled={!d}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                background: "none", border: "none", padding: "2px 0 6px",
                cursor: d ? "pointer" : "default", font: "inherit",
              }}
            >
              <span style={{
                width: CIRCLE, height: CIRCLE, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: isToday ? 700 : 500,
                color: isToday ? "#fff" : "var(--text)",
                background: isToday ? "var(--accent)" : hasSession ? "var(--overlay-3)" : "var(--overlay-1)",
                outline: selectedDate === cell.iso ? "2px solid var(--accent)" : "none",
                outlineOffset: 1,
              }}>
                {cell.day}
              </span>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor ?? "transparent" }} />
            </button>
          );
        })}
      </div>

      {presentTypes.length > 0 && (
        <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
          {presentTypes.map(type => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: SESSION_COLOR[type] ?? "var(--dim)" }} />
              {SESSION_LABEL[type] ?? (type.charAt(0).toUpperCase() + type.slice(1))}
            </div>
          ))}
          {Object.values(dayMap).some(d => d.completedActivities?.length) && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
              Completed
            </div>
          )}
        </div>
      )}

      <SessionDetailModal day={selected} strengthSession={selectedStrength} onClose={() => setSelectedDate(null)} bench1RMKg={bench1RMKg} weightRecommendations={weightRecommendations} />
    </div>
  );
}
