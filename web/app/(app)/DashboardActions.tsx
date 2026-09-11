"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { queueReplan } from "@/app/actions/replan";
import { ReplanConfirmModal } from "./ReplanConfirmModal";

interface Props {
  seasonEnded: boolean;
  planEndDate: string;
}

// The check-in prompt used to live here too, but now lives inside the "This
// Week" card's "Next check-in" stat (see CheckInCTA) — this component only
// handles the season-end case, which has no equivalent always-visible stat
// to fold into and stays a standalone prompt.
export function DashboardActions({ seasonEnded, planEndDate }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setOpen(false);
    startTransition(async () => {
      try {
        await queueReplan("seasonal", comment);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to queue job");
      }
    });
  }

  if (!seasonEnded) return null;

  return (
    <>
      {open && (
        <ReplanConfirmModal
          type="seasonal"
          comment={comment}
          onCommentChange={setComment}
          onClose={() => setOpen(false)}
          onConfirm={confirm}
          isPending={isPending}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {error && <div className="alert alert-bad">{error}</div>}

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
            <button
              className="btn-primary"
              disabled={isPending}
              onClick={() => { setComment(""); setError(null); setOpen(true); }}
            >
              <i className="ti ti-sparkles" style={{ fontSize: 15, marginRight: 6 }} />
              Start New Season
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
