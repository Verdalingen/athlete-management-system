"use client";

import { useState } from "react";
import type { ScheduledDay, StrengthSession } from "@/lib/types";
import { formatWeekday } from "@/lib/dates";
import type { WeightRecommendation } from "@/lib/strength";
import { SessionDetailModal, type DayData } from "./SessionDetailModal";
import { SESSION_COLOR } from "@/lib/session-theme";

export function WeekAtGlanceStrip({
  weekDays, strengthMap, dayMetas, today, bench1RMKg, weightRecommendations,
}: {
  weekDays: ScheduledDay[];
  strengthMap: Record<string, StrengthSession>;
  dayMetas: Record<string, { purpose: string; adaptation: string }>;
  today: string;
  bench1RMKg?: number | null;
  weightRecommendations?: Record<string, WeightRecommendation>;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selectedDay = selectedDate
    ? weekDays.find(d => d.date === selectedDate) ?? null
    : null;
  const selected: DayData | null = selectedDay
    ? { ...selectedDay, ...(dayMetas[selectedDate!] ?? { purpose: "", adaptation: "" }) }
    : null;
  const selectedStrength = selectedDate ? strengthMap[selectedDate] ?? null : null;

  return (
    <>
      <div className="week-strip">
        {weekDays.map((d) => {
          const isToday = d.date === today;
          const cls = [
            "strip-cell",
            d.is_key ? "key-session" : "",
            isToday ? "today-cell" : "",
            d.is_rest ? "rest-day" : "",
          ].filter(Boolean).join(" ");
          return (
            <div
              key={d.id}
              className={cls}
              onClick={() => setSelectedDate(prev => prev === d.date ? null : d.date)}
              style={{ cursor: "pointer" }}
            >
              <div className="strip-day">{formatWeekday(d.date)}</div>
              <div
                className="strip-dot"
                style={{ background: SESSION_COLOR[d.session_type] ?? "var(--dim)" }}
              />
              <div className="strip-focus">{d.focus ?? (d.is_rest ? "Rest" : d.session_type)}</div>
            </div>
          );
        })}
      </div>

      <SessionDetailModal day={selected} strengthSession={selectedStrength} onClose={() => setSelectedDate(null)} bench1RMKg={bench1RMKg} weightRecommendations={weightRecommendations} />
    </>
  );
}
