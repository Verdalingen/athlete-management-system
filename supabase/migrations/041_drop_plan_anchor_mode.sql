-- 041: Drop plan_anchor_mode (added in 039, never read).
--
-- It was the wrong abstraction: a global weekday-vs-sequence switch, when the real property is
-- per-session ("this class is on Tuesday, everything else floats") and the real decision is the
-- coach's per check-in, not a mode the athlete pre-selects. Replaced by:
--   - recurring_session_requests[].day_flexibility = "fixed" for genuine weekday pins
--   - the drift analysis in services/supabase/plan_drift.py supplying the facts
--   - the planner choosing shift / absorb / drop / re-anchor and saying why
--
-- Dropping the column also drops 039's CHECK constraint and COLUMN COMMENT with it.
-- IF EXISTS so this is a no-op on a database that never applied 039.

ALTER TABLE athlete_profile
  DROP COLUMN IF EXISTS plan_anchor_mode;
