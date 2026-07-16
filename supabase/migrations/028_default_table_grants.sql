-- 028: End the recurring "new table shipped without grants" gap (022 athlete_memory,
-- 026 replan_jobs, 027 completed_activities were all one-off fixes for the same
-- class of problem). Grant standard DML on every existing public table, and set
-- default privileges so tables created by future migrations get the grants
-- automatically instead of failing with "permission denied" at first use.
-- Row-level security policies still gate what authenticated users can touch.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role, authenticated;
