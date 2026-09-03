"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { queueReplan } from "@/app/actions/replan";
import { ReplanConfirmModal } from "./ReplanConfirmModal";

// Lives inside the "This Week" card's "Next check-in" stat instead of its own
// full-width section — folds the CTA into the stat it's already redundant with
// rather than repeating "check-in due" as a second, separately-styled section.
export function CheckInCTA({ daysSinceCheckin }: { daysSinceCheckin: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setOpen(false);
    startTransition(async () => {
      try {
        await queueReplan("replan", comment);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to queue job");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setComment(""); setError(null); setOpen(true); }}
        disabled={isPending}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          background: "none", border: "none", padding: 0, marginTop: 1,
          color: "var(--amber)", fontSize: 11, fontWeight: 700,
          cursor: isPending ? "default" : "pointer", textAlign: "left",
        }}
      >
        <i className="ti ti-refresh" style={{ fontSize: 11 }} aria-hidden="true" />
        {isPending
          ? "Queuing…"
          : daysSinceCheckin === 0 ? "Due today — run check-in" : `${daysSinceCheckin}d overdue — run check-in`}
      </button>
      {error && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 3 }}>{error}</div>}

      {open && (
        <ReplanConfirmModal
          type="replan"
          comment={comment}
          onCommentChange={setComment}
          onClose={() => setOpen(false)}
          onConfirm={confirm}
          isPending={isPending}
        />
      )}
    </>
  );
}
