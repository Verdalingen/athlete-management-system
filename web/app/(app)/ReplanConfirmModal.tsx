"use client";

type ReplanModalType = "replan" | "seasonal";

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

// Shared by CheckInCTA ("replan") and DashboardActions ("seasonal") so the confirm
// dialog stays visually and behaviorally identical no matter which trigger opened it.
export const REPLAN_MODAL_CONFIG: Record<ReplanModalType, ModalConfig> = {
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

export function ReplanConfirmModal({
  type, comment, onCommentChange, onClose, onConfirm, isPending,
}: {
  type: ReplanModalType;
  comment: string;
  onCommentChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const modal = REPLAN_MODAL_CONFIG[type];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,.65)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
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
          onChange={e => onCommentChange(e.target.value)}
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
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className={modal.confirmClass} onClick={onConfirm} disabled={isPending}>
            {isPending ? "Queuing…" : modal.confirmLabel}
            <span style={{ fontSize: 11, opacity: .65, marginLeft: 8 }}>{modal.cost}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
