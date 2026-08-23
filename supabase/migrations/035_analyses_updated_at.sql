-- 035: Track when a KPI snapshot was actually last written, not just its report_date.
--
-- upsert_kpis() UPDATEs the current day's row on every KPI sync (multiple times/day is
-- normal), so created_at (set once, on first insert) can't answer "how fresh is this
-- data" — it stays pinned to whenever today's row was first created. updated_at gives
-- the web dashboard a real wall-clock signal to show "last synced Xh ago" and to gate
-- the manual refresh button against the same KPI_SYNC_MIN_INTERVAL the backend enforces.
-- See services/supabase/plan_writer.py::upsert_kpis() and web/app/(app)/RefreshDataButton.tsx.

ALTER TABLE analyses
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
