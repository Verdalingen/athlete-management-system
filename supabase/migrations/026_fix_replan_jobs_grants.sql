-- 026: replan_jobs exists live with RLS enabled and a policy in place, but the
-- table's standard GRANTs to service_role/authenticated were never applied (only
-- TRUNCATE/REFERENCES/TRIGGER were granted, not SELECT/INSERT/UPDATE/DELETE) —
-- causing "permission denied for table replan_jobs" on every check-in attempt.
-- Same class of gap as migration 022 (athlete_memory).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.replan_jobs TO service_role, authenticated;
