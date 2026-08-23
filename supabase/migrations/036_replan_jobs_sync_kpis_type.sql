-- 036: Allow "sync_kpis" as a replan_jobs.type value.
--
-- The dashboard's manual "refresh Garmin data" button (RefreshDataButton.tsx) queues a
-- lightweight sync_kpis job through the same replan_jobs queue + process_queue() worker
-- the Check-In/Reschedule/New-Season jobs already use, rather than adding a second queue
-- table for one more job kind.

ALTER TABLE replan_jobs DROP CONSTRAINT replan_jobs_type_check;
ALTER TABLE replan_jobs
  ADD CONSTRAINT replan_jobs_type_check
  CHECK (type = ANY (ARRAY['daily'::text, 'replan'::text, 'seasonal'::text, 'sync_kpis'::text]));
