"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { queueReplan } from "@/app/actions/replan";
import type { ReplanJob, ReplanJobType } from "@/app/actions/replan";

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  running: "Running…",
  done:    "Done",
  error:   "Failed",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--amber)",
  running: "var(--cyan)",
  done:    "var(--green)",
  error:   "var(--red)",
};

const MODAL_CONFIG: Record<ReplanJobType, {
  title: string;
  cost: string;
  description: string;
  commentPlaceholder: string;
  confirmLabel: string;
  confirmClass: string;
  note?: string;
}> = {
  daily: {
    title: "Reschedule",
    cost: "~$0.02",
    description: "Reads recent Garmin data, detects missed or incomplete sessions, and shifts the upcoming calendar to get you back on track. This is a mechanical adjustment — no AI re-planning.",
    commentPlaceholder: "Optional note — what happened? (e.g. sick for 3 days, travel, etc.)",
    confirmLabel: "Queue Reschedule",
    confirmClass: "btn-soft",
    note: "Calendar date selection is coming in a future update. For now, describe the disruption in your note.",
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

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface Props { initialJobs: ReplanJob[] }

export function ReplanPanel({ initialJobs }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeModal, setActiveModal] = useState<ReplanJobType | null>(null);
  const [comment, setComment] = useState("");
  const [jobs, setJobs] = useState<ReplanJob[]>(initialJobs);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hasActive = jobs.some(j => j.status === "pending" || j.status === "running");
    if (!hasActive) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [jobs, router]);

  useEffect(() => { setJobs(initialJobs); }, [initialJobs]);

  function openModal(type: ReplanJobType) {
    setComment("");
    setError(null);
    setActiveModal(type);
  }

  function closeModal() { setActiveModal(null); }

  function confirm() {
    if (!activeModal) return;
    const type = activeModal;
    closeModal();
    setError(null);
    startTransition(async () => {
      try {
        await queueReplan(type, comment);
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
      {/* Action modal */}
      {modal && activeModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,.65)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={closeModal}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              border: `1px solid ${activeModal === "seasonal" ? "rgba(255,92,122,.35)" : "rgba(255,255,255,.1)"}`,
              borderRadius: 16, padding: "28px 32px", maxWidth: 460, width: "90%",
              display: "flex", flexDirection: "column", gap: 16,
            }}
          >
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
              color: activeModal === "seasonal" ? "var(--red)" : activeModal === "replan" ? "var(--cyan)" : "var(--muted)",
            }}>
              {modal.title}
            </div>

            <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--muted)", margin: 0 }}>
              {modal.description}
            </p>

            {modal.note && (
              <div style={{
                fontSize: 12, color: "var(--dim)", background: "rgba(255,255,255,.04)",
                borderRadius: 8, padding: "10px 12px", lineHeight: 1.5,
              }}>
                {modal.note}
              </div>
            )}

            <textarea
              autoFocus
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

      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="btn-soft"
            disabled={isActive}
            onClick={() => openModal("daily")}
          >
            <i className="ti ti-calendar-event" style={{ fontSize: 15, marginRight: 6 }} />
            {isPending ? "Queuing…" : "Reschedule"}
          </button>
          <button
            className="btn-primary"
            disabled={isActive}
            onClick={() => openModal("replan")}
          >
            <i className="ti ti-refresh" style={{ fontSize: 15, marginRight: 6 }} />
            {isPending ? "Queuing…" : "Check-In"}
          </button>
          <button
            className="btn-secondary"
            disabled={isActive}
            onClick={() => openModal("seasonal")}
          >
            <i className="ti ti-sparkles" style={{ fontSize: 15, marginRight: 6 }} />
            New Season
          </button>
        </div>

        {error && (
          <div className="alert alert-bad" style={{ marginTop: 12, marginBottom: 0 }}>
            {error}
          </div>
        )}

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
                      background: "rgba(45,226,230,.06)",
                      border: "1px solid rgba(45,226,230,.15)",
                      borderRadius: 8,
                      padding: "10px 14px",
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
