-- 034: Structured running-workout segments + Garmin push tracking
--
-- Mirrors strength_sessions.garmin_workout_id — running sessions now get pushed to Garmin
-- Connect as real structured workouts, the same way strength sessions already do. Segments are
-- JSONB (not a child table like exercises) since they're small, ordered, and never queried
-- independently of their scheduled_day. See web/DESIGN.md / services/garmin/running_uploader.py.

ALTER TABLE scheduled_days
  ADD COLUMN running_segments JSONB,      -- ordered list of RunningSegment dicts, run days only
  ADD COLUMN garmin_workout_id BIGINT;    -- mirrors strength_sessions.garmin_workout_id
