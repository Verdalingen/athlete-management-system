"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { queueReplan } from "@/app/actions/replan";
import type { ReplanJob, ReplanJobType } from "@/app/actions/replan";
import type { ScheduledDay } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued", running: "Running…", done: "Done", error: "Failed",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "var(--amber)", running: "var(--cyan)", done: "var(--green)", error: "var(--red)",
};
const SESSION_DOT: Record<string, string> = {
  run: "var(--cyan)", strength: "var(--accent)", race: "var(--red)", cross: "var(--green)",
};

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toDateStr(d);
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatRescheduleComment(
  selectedDates: string[],
  sessionMap: Map<string, ScheduledDay>,
  note: string,
): string {
  const today = todayStr();
  const missed   = selectedDates.filter(d => d <  today).sort();
  const upcoming = selectedDates.filter(d => d >= today).sort();
  const lines: string[] = [];

  if (missed.length > 0) {
    lines.push("Missed sessions:");
    missed.forEach(d => {
      const s = sessionMap.get(d);
      lines.push(`  - ${d}${s?.focus ? ` (${s.focus})` : ""}`);
    });
  }
  if (upcoming.length > 0) {
    lines.push("Upcoming constraints:");
    upcoming.forEach(d => {
      const s = sessionMap.get(d);
      lines.push(`  - ${d}${s?.focus ? ` (${s.focus})` : ""}`);
    });
  }
  if (note.trim()) {
    if (lines.length > 0) lines.push("");
    lines.push(`Note: ${note.trim()}`);
  }
  return lines.join("\n");
}

// ── Calendar component ────────────────────────────────────────────────────────

function CalendarPicker({
  scheduledDays,
  selectedDates,
  onToggle,
  onClear,
}: {
  scheduledDays: ScheduledDay[];
  selectedDates: string[];
  onToggle: (date: string, shiftHeld: boolean) => void;
  onClear: () => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toDateStr(today);

  // Start from Monday of last week
  const dow = today.getDay(); // 0=Sun
  const daysToLastMonday = (dow === 0 ? 6 : dow - 1) + 7;
  const start = new Date(today);
  start.setDate(today.getDate() - daysToLastMonday);

  // Build 5 weeks
  const weeks: Date[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 5; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  const sessionMap = new Map(scheduledDays.map(s => [s.date, s]));

  const monthLabel = (() => {
    const months = new Set(weeks.flat().map(d => d.toLocaleString("en", { month: "long", year: "numeric" })));
    return [...months].join(" / ");
  })();

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", marginBottom: 8, textAlign: "center" }}>
        {monthLabel}
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--dim)", padding: "2px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div style={{ userSelect: "none" }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
            {week.map(day => {
              const ds = toDateStr(day);
              const isPast     = ds < todayISO;
              const isToday    = ds === todayISO;
              const isSelected = selectedDates.includes(ds);
              const session    = sessionMap.get(ds);
              const dotColor   = session && !session.is_rest ? SESSION_DOT[session.session_type] : null;

              let bg = "rgba(255,255,255,.04)";
              let border = "1px solid rgba(255,255,255,.06)";
              let textColor = isPast ? "var(--dim)" : "var(--text)";

              if (isSelected) {
                if (isPast) {
                  bg     = "rgba(255,92,122,.2)";
                  border = "1px solid rgba(255,92,122,.5)";
                } else {
                  bg     = "rgba(255,180,0,.2)";
                  border = "1px solid rgba(255,180,0,.5)";
                }
                textColor = "var(--text)";
              }
              if (isToday && !isSelected) {
                border = "2px solid rgba(255,255,255,.35)";
              }

              return (
                <button
                  key={ds}
                  onMouseDown={e => { e.preventDefault(); onToggle(ds, e.shiftKey); }}
                  title={session?.focus ?? undefined}
                  style={{
                    background: bg, border, borderRadius: 6,
                    padding: "5px 2px 4px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "background .1s, border-color .1s",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: textColor, lineHeight: 1 }}>
                    {day.getDate()}
                  </span>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: dotColor ?? "transparent",
                    flexShrink: 0,
                  }} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend + controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--dim)" }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(255,92,122,.25)", border: "1px solid rgba(255,92,122,.5)" }} />
            Missed
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--dim)" }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(255,180,0,.25)", border: "1px solid rgba(255,180,0,.5)" }} />
            Constrained
          </div>
          {Object.entries(SESSION_DOT).map(([type, color]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--dim)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, color: "var(--dim)" }}>Shift+click to range-select</span>
          {selectedDates.length > 0 && (
            <button
              onMouseDown={e => { e.preventDefault(); onClear(); }}
              style={{
                background: "rgba(255,92,122,.12)", border: "1px solid rgba(255,92,122,.35)",
                borderRadius: 5, padding: "3px 9px",
                fontSize: 11, color: "var(--red)", cursor: "pointer",
                fontFamily: "inherit", fontWeight: 600,
              }}
            >
              Clear {selectedDates.length}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal config ──────────────────────────────────────────────────────────────

const MODAL_CONFIG: Record<ReplanJobType, {
  title: string;
  cost: string;
  description: string;
  commentPlaceholder: string;
  confirmLabel: string;
  confirmClass: string;
}> = {
  daily: {
    title: "Reschedule",
    cost: "~$0.02",
    description: "Mark dates you missed or will be constrained, then add a note. The coach will decide what to reschedule or drop.",
    commentPlaceholder: "Optional note — what happened, or what constraints are coming up? (e.g. sick, travel, limited time)",
    confirmLabel: "Queue Reschedule",
    confirmClass: "btn-soft",
  },
  replan: {
    title: "Check-In",
    cost: "~$0.20",
    description: "Reads 14 days of Garmin data and uses AI to re-plan the next 6 weeks, adapting to what was actually completed while staying true to the season plan. Weeks beyond that window are preserved unchanged.",
    commentPlaceholder: "Optional note — how has training been since last check-in? Fatigue, injuries, upcoming constraints…",
    confirmLabel: "Queue Check-In",
    confirmClass: "btn-primary",
  },
  seasonal: {
    title: "New Season",
    cost: "~$1–3",
    description: "Runs the full AI pipeline — expert analysis, new HTML reports, and a completely new season plan for the next training block. Use when your current season ends or after a major shift in goals.",
    commentPlaceholder: "Optional note — goals or focus areas for the new season…",
    confirmLabel: "Start New Season",
    confirmClass: "btn-danger",
  },
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  initialJobs: ReplanJob[];
  scheduledDays: ScheduledDay[];
}

export function ReplanPanel({ initialJobs, scheduledDays }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeModal, setActiveModal] = useState<ReplanJobType | null>(null);
  const [comment, setComment] = useState("");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [jobs, setJobs] = useState<ReplanJob[]>(initialJobs);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<{ date: string; mode: "select" | "deselect" } | null>(null);
  const baseSelectionRef = useRef<string[]>([]);

  const sessionMap = new Map(scheduledDays.map(s => [s.date, s]));

  useEffect(() => {
    const hasActive = jobs.some(j => j.status === "pending" || j.status === "running");
    if (!hasActive) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [jobs, router]);

  useEffect(() => { setJobs(initialJobs); }, [initialJobs]);

  useEffect(() => {
    if (selectedDates.length === 0) {
      anchorRef.current = null;
      baseSelectionRef.current = [];
    }
  }, [selectedDates]);

  function openModal(type: ReplanJobType) {
    setComment("");
    setSelectedDates([]);
    setError(null);
    anchorRef.current = null;
    baseSelectionRef.current = [];
    setActiveModal(type);
  }

  function closeModal() { setActiveModal(null); }

  const toggleDate = useCallback((d: string, shiftHeld: boolean) => {
    if (shiftHeld && anchorRef.current && anchorRef.current.date !== d) {
      const { date: anchorDate, mode } = anchorRef.current;
      const [start, end] = [anchorDate, d].sort();
      const range: string[] = [];
      const cursor = new Date(start + "T00:00:00");
      const endDate = new Date(end + "T00:00:00");
      while (cursor <= endDate) {
        range.push(toDateStr(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      // Apply range against the base snapshot so re-adjusting the range is clean
      const next = (() => {
        const set = new Set(baseSelectionRef.current);
        if (mode === "select") range.forEach(r => set.add(r));
        else range.forEach(r => set.delete(r));
        return [...set];
      })();
      setSelectedDates(next);
    } else {
      setSelectedDates(prev => {
        const willBeSelected = !prev.includes(d);
        const next = willBeSelected ? [...prev, d] : prev.filter(x => x !== d);
        // Each plain click becomes the new base and anchor
        baseSelectionRef.current = next;
        anchorRef.current = { date: d, mode: willBeSelected ? "select" : "deselect" };
        return next;
      });
    }
  }, []);

  function confirm() {
    if (!activeModal) return;
    const type = activeModal;
    const finalComment = type === "daily"
      ? formatRescheduleComment(selectedDates, sessionMap, comment)
      : comment;
    closeModal();
    setError(null);
    startTransition(async () => {
      try {
        await queueReplan(type, finalComment);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    });
  }

  const isActive = isPending || jobs.some(j => j.status === "pending" || j.status === "running");
  const modal = activeModal ? MODAL_CONFIG[activeModal] : null;

  return (
    <>
      {/* Modal */}
      {modal && activeModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,.7)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            padding: "16px",
          }}
          onClick={closeModal}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              border: `1px solid ${activeModal === "seasonal" ? "rgba(255,92,122,.35)" : "rgba(255,255,255,.1)"}`,
              borderRadius: 16, padding: "24px 28px",
              width: "100%", maxWidth: activeModal === "daily" ? 520 : 460,
              maxHeight: "90vh", overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 16,
            }}
          >
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
              color: activeModal === "seasonal" ? "var(--red)" : activeModal === "replan" ? "var(--cyan)" : "var(--accent)",
            }}>
              {modal.title}
            </div>

            <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--muted)", margin: 0 }}>
              {modal.description}
            </p>

            {/* Calendar — only for Reschedule */}
            {activeModal === "daily" && (
              <CalendarPicker
                scheduledDays={scheduledDays}
                selectedDates={selectedDates}
                onToggle={toggleDate}
                onClear={() => { setSelectedDates([]); anchorRef.current = null; baseSelectionRef.current = []; }}
              />
            )}

            <textarea
              autoFocus={activeModal !== "daily"}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={modal.commentPlaceholder}
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 8, padding: "10px 12px",
                color: "var(--text)", fontSize: 13, lineHeight: 1.5,
                resize: "vertical", outline: "none", fontFamily: "inherit",
              }}
            />

            <p style={{ fontSize: 12, color: "var(--dim)", margin: 0 }}>
              After queuing, run <code style={{ background: "rgba(255,255,255,.06)", padding: "2px 6px", borderRadius: 4 }}>--queue config.yaml</code> to process.
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className={modal.confirmClass} onClick={confirm}>
                {modal.confirmLabel}
                <span style={{ fontSize: 11, opacity: .65, marginLeft: 8 }}>{modal.cost}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trigger buttons */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn-soft" disabled={isActive} onClick={() => openModal("daily")}>
            <i className="ti ti-calendar-event" style={{ fontSize: 15, marginRight: 6 }} />
            {isPending ? "Queuing…" : "Reschedule"}
          </button>
          <button className="btn-primary" disabled={isActive} onClick={() => openModal("replan")}>
            <i className="ti ti-refresh" style={{ fontSize: 15, marginRight: 6 }} />
            {isPending ? "Queuing…" : "Check-In"}
          </button>
          <button className="btn-secondary" disabled={isActive} onClick={() => openModal("seasonal")}>
            <i className="ti ti-sparkles" style={{ fontSize: 15, marginRight: 6 }} />
            New Season
          </button>
        </div>

        {error && (
          <div className="alert alert-bad" style={{ marginTop: 12, marginBottom: 0 }}>
            {error}
          </div>
        )}

        {/* Recent jobs */}
        {jobs.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}>
              Recent jobs
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobs.map(job => (
                <div key={job.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                    <span style={{ color: STATUS_COLOR[job.status] ?? "var(--muted)", fontWeight: 600, minWidth: 60 }}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                    <span style={{ color: "var(--muted)" }}>
                      {job.type === "daily" ? "Reschedule" : job.type === "replan" ? "Check-In" : "New Season"}
                    </span>
                    <span style={{ color: "var(--dim)" }}>·</span>
                    <span style={{ color: "var(--dim)" }}>{timeAgo(job.created_at)}</span>
                    {job.error_message && (
                      <span style={{ color: "var(--red)", fontSize: 11 }} title={job.error_message}>
                        — {job.error_message.slice(0, 60)}
                      </span>
                    )}
                  </div>
                  {job.type === "replan" && job.coach_feedback && (
                    <div style={{
                      marginTop: 8,
                      background: "rgba(45,226,230,.06)", border: "1px solid rgba(45,226,230,.15)",
                      borderRadius: 8, padding: "10px 14px",
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--cyan)", marginBottom: 6 }}>
                        Coach Feedback
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                        {job.coach_feedback}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
