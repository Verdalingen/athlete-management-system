-- 027: completed_activities (migration 025) had RLS enabled and a policy in place,
-- but was missing the standard GRANT to service_role/authenticated — same class of
-- gap as migrations 022 (athlete_memory) and 026 (replan_jobs). Caused
-- "permission denied for table completed_activities" on every real sync attempt.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.completed_activities TO service_role, authenticated;
