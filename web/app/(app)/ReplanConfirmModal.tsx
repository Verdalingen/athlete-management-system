"use client";

import { useT } from "@/lib/i18n/LanguageContext";

type ReplanModalType = "replan" | "seasonal";

interface ModalConfig {
  cost: string;
  accentColor: string;
  borderColor: string;
  confirmClass: string;
}

// Shared by CheckInCTA ("replan") and DashboardActions ("seasonal") so the confirm
// dialog stays visually and behaviorally identical no matter which trigger opened it.
// Text content (title/description/placeholder/confirm label) lives in the
// dashboard.replanModal dictionary namespace instead, keyed the same way.
export const REPLAN_MODAL_CONFIG: Record<ReplanModalType, ModalConfig> = {
  replan: {
    cost: "~$0.20",
    accentColor: "var(--cyan)",
    borderColor: "rgba(45,226,230,.35)",
    confirmClass: "btn-primary",
  },
  seasonal: {
    cost: "~$1–3",
    accentColor: "var(--red)",
    borderColor: "rgba(var(--red-rgb),.35)",
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
  const t = useT();
  const modal = REPLAN_MODAL_CONFIG[type];
  const text = t.dashboard.replanModal[type];

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
          {text.title}
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--muted)", margin: 0 }}>
          {text.description}
        </p>

        <textarea
          autoFocus
          value={comment}
          onChange={e => onCommentChange(e.target.value)}
          placeholder={text.commentPlaceholder}
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
          {t.dashboard.replanModal.queuePrefix} <code style={{ background: "rgba(var(--overlay-rgb),.06)", padding: "2px 6px", borderRadius: 4 }}>--queue config.yaml</code> {t.dashboard.replanModal.queueSuffix}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          <button className="btn-secondary" onClick={onClose}>{t.common.actions.cancel}</button>
          <button className={modal.confirmClass} onClick={onConfirm} disabled={isPending}>
            {isPending ? t.dashboard.replanModal.queuing : text.confirmLabel}
            <span style={{ fontSize: 11, opacity: .65, marginLeft: 8 }}>{modal.cost}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
