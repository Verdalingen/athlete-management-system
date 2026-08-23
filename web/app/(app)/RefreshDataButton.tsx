"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { queueReplan } from "@/app/actions/replan";
import type { ReplanJob } from "@/app/actions/replan";

// Mirrors KPI_SYNC_MIN_INTERVAL in cli/garmin_ai_coach_cli.py — keep these in sync.
// The backend enforces this authoritatively (via a local stamp file, checked again
// when the queued job actually runs); this is just so the button doesn't invite a
// click that the backend will silently no-op.
const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;

function formatElapsed(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "just now";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h${minutes ? ` ${minutes}m` : ""} ago`;
  return `${minutes}m ago`;
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
  return `${minutes}m`;
}

/** Manual "refresh Garmin data" button for the dashboard — queues the same
 * lightweight sync_kpis job the LaunchAgent runs automatically every 2h+ (see
 * KPI_SYNC_MIN_INTERVAL). Disabled client-side within that same window so the
 * button doesn't invite a click the backend will just no-op; the queued job's
 * own coach_feedback (from cmd_sync_kpis' return value) confirms what actually
 * happened once it completes, via the same replan_jobs queue + poll pattern
 * ReplanPanel.tsx already uses. */
export function RefreshDataButton({ lastSyncedAt, initialJobs }: {
  lastSyncedAt: string | null;
  initialJobs: ReplanJob[];
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ReplanJob[]>(initialJobs);
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  // Client-only "now" (avoids a hydration mismatch from computing elapsed time
  // during server render), refreshed every 30s so the label and disabled state
  // stay live without needing a full page reload.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setJobs(initialJobs); }, [initialJobs]);

  const syncJobs = jobs.filter(j => j.type === "sync_kpis");
  const latestSyncJob = syncJobs[0] ?? null;

  useEffect(() => {
    const hasActive = syncJobs.some(j => j.status === "pending" || j.status === "running");
    if (!hasActive) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, router]);

  const elapsedMs = now != null && lastSyncedAt != null ? now - new Date(lastSyncedAt).getTime() : null;
  const withinMinInterval = elapsedMs != null && elapsedMs < MIN_INTERVAL_MS;
  const isActive = queuing || syncJobs.some(j => j.status === "pending" || j.status === "running");
  const disabled = isActive || withinMinInterval;

  async function handleClick() {
    setError(null);
    setQueuing(true);
    try {
      await queueReplan("sync_kpis");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to queue refresh");
    } finally {
      setQueuing(false);
    }
  }

  const label = now == null
    ? ""
    : isActive
      ? "Refreshing…"
      : lastSyncedAt == null
        ? "Never synced"
        : `Synced ${formatElapsed(elapsedMs!)}`;

  const title = withinMinInterval && !isActive
    ? `Already synced recently — next refresh eligible in ${formatRemaining(MIN_INTERVAL_MS - elapsedMs!)}`
    : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        className="btn-secondary"
        onClick={handleClick}
        disabled={disabled}
        title={title}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px" }}
      >
        <i
          className="ti ti-refresh"
          style={{ fontSize: 13, animation: isActive ? "spin 1s linear infinite" : undefined }}
          aria-hidden="true"
        />
        {label}
      </button>
      {error && <span style={{ fontSize: 11, color: "var(--red)" }}>{error}</span>}
      {!error && !isActive && latestSyncJob?.status === "done" && latestSyncJob.coach_feedback && (
        <span style={{ fontSize: 11, color: "var(--dim)" }}>{latestSyncJob.coach_feedback}</span>
      )}
      {!error && !isActive && latestSyncJob?.status === "error" && (
        <span style={{ fontSize: 11, color: "var(--red)" }}>{latestSyncJob.error_message ?? "Refresh failed"}</span>
      )}
    </div>
  );
}
