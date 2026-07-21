"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { queueReplan } from "@/app/actions/replan";
import type { ReplanJobType } from "@/app/actions/replan";

interface Props {
  checkinOverdue: boolean;
  daysSinceCheckin: number;
  seasonEnded: boolean;
  planEndDate: string;
}

interface ModalConfig {
  title: string;
  cost: string;
  accentColor: string;
  borderColor: string;
  description: string;
  commentPlaceholder: string;
  confirmLabel: string;
  confirmClass: string;
}

const MODAL: Record<string, ModalConfig> = {
  replan: {
    title: "Check-In",
    cost: "~$0.20",
    accentColor: "var(--cyan)",
    borderColor: "rgba(45,226,230,.35)",
    description: "Reads 14 days of Garmin data and uses AI to re-plan the next 6 weeks, adapting to what was actually completed while staying true to the season plan.",
    commentPlaceholder: "Optional note — how has training been? Fatigue, missed sessions, upcoming constraints…",
    confirmLabel: "Queue Check-In",
    confirmClass: "btn-primary",
  },
  seasonal: {
    title: "New Season",
    cost: "~$1–3",
    accentColor: "var(--red)",
    borderColor: "rgba(var(--red-rgb),.35)",
    description: "Runs the full AI pipeline — expert analysis, new HTML reports, and a completely new season plan for the next training block.",
    commentPlaceholder: "Optional note — goals or focus areas for the new season…",
    confirmLabel: "Start New Season",
    confirmClass: "btn-danger",
  },
};

export function DashboardActions({ checkinOverdue, daysSinceCheckin, seasonEnded, planEndDate }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeModal, setActiveModal] = useState<ReplanJobType | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    startTransition(async () => {
      try {
        await queueReplan(type, comment);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to queue job");
      }
    });
  }

  if (!checkinOverdue && !seasonEnded) return null;

  const modal = activeModal ? MODAL[activeModal] : null;

  return (
    <>
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
              background: "var(--surface)", border: `1px solid ${modal.borderColor}`,
              borderRadius: 16, padding: "28px 32px", maxWidth: 460, width: "90%",
              display: "flex", flexDirection: "column", gap: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: modal.accentColor }}>
              {modal.title}
            </div>

            <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--muted)", margin: 0 }}>
              {modal.description}
            </p>

            <textarea
              autoFocus
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={modal.commentPlaceholder}
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(var(--overlay-rgb),.04)", border: "1px solid rgba(var(--overlay-rgb),.12)",
                borderRadius: 8, padding: "10px 12px",
                color: "var(--text)", fontSize: 13, lineHeight: 1.5,
                resize: "vertical", outline: "none", fontFamily: "inherit",
              }}
            />

            <p style={{ fontSize: 12, color: "var(--dim)", margin: 0 }}>
              After queuing, run <code style={{ background: "rgba(var(--overlay-rgb),.06)", padding: "2px 6px", borderRadius: 4 }}>--queue config.yaml</code> to process.
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className={modal.confirmClass} onClick={confirm} disabled={isPending}>
                {isPending ? "Queuing…" : modal.confirmLabel}
                <span style={{ fontSize: 11, opacity: .65, marginLeft: 8 }}>{modal.cost}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {error && <div className="alert alert-bad">{error}</div>}

        {seasonEnded && (
          <div className="card card-accent" style={{ borderLeftWidth: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
                  Season Complete
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>
                  Your plan ended on {planEndDate}. Ready to plan the next training block?
                </div>
              </div>
              <button className="btn-primary" disabled={isPending} onClick={() => openModal("seasonal")}>
                <i className="ti ti-sparkles" style={{ fontSize: 15, marginRight: 6 }} />
                Start New Season
              </button>
            </div>
          </div>
        )}

        {checkinOverdue && !seasonEnded && (
          <div className="card" style={{ borderLeftWidth: 4, borderLeftColor: "var(--cyan)", borderColor: "rgba(45,226,230,.35)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--cyan)", marginBottom: 4 }}>
                  Check-In Due
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>
                  {daysSinceCheckin === 0
                    ? "Your weekly check-in is due today."
                    : `Last check-in was ${daysSinceCheckin} day${daysSinceCheckin !== 1 ? "s" : ""} ago.`}
                </div>
              </div>
              <button className="btn-primary" disabled={isPending} onClick={() => openModal("replan")}>
                <i className="ti ti-refresh" style={{ fontSize: 15, marginRight: 6 }} />
                {isPending ? "Queuing…" : "Run Check-In"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
