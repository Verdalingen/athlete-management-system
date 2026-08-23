-- 040: 'shift' job type + a params column for job-type-specific arguments.
--
-- Shifting needs an argument (how many days, from when) that doesn't fit user_comment —
-- that field carries the athlete's free-text note and is fed to the LLM, so overloading it
-- with machine parameters would both corrupt the note and be fragile to parse.

ALTER TABLE replan_jobs DROP CONSTRAINT IF EXISTS replan_jobs_type_check;
ALTER TABLE replan_jobs ADD CONSTRAINT replan_jobs_type_check
  CHECK (type IN ('daily', 'replan', 'seasonal', 'sync_kpis', 'shift'));

ALTER TABLE replan_jobs ADD COLUMN IF NOT EXISTS params JSONB;

COMMENT ON COLUMN replan_jobs.params IS
  'Job-type-specific arguments. shift: {"days": N, "from_date": "YYYY-MM-DD"}. Other types take their input via user_comment.';
