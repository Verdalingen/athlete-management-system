-- 046: HR zone/range on completed_activities.
--
-- There is currently no HR "intensity zones" concept anywhere in this codebase —
-- user_settings only stores a single flat max_heart_rate_bpm value (see 042). This
-- migration adds the persisted output of the new %-of-max-HR zone model (see
-- services/garmin/hr_zones.py) onto each completed activity: which zone (Z1-Z5) the
-- session's average heart rate fell in, and that zone's bpm range at the time it was
-- computed. Forward-only by explicit decision — no backfill of already-imported
-- sessions, so these columns stay null on historical rows rather than being guessed
-- retroactively from a max HR that may not have been accurate at the time.
--
-- ADD COLUMN IF NOT EXISTS per this repo's established safe-migration pattern (see 042).

ALTER TABLE completed_activities ADD COLUMN IF NOT EXISTS hr_zone TEXT;
ALTER TABLE completed_activities ADD COLUMN IF NOT EXISTS hr_zone_low_bpm SMALLINT;
ALTER TABLE completed_activities ADD COLUMN IF NOT EXISTS hr_zone_high_bpm SMALLINT;

COMMENT ON COLUMN completed_activities.hr_zone IS
  'Assigned HR intensity zone (Z1-Z5, %-of-max-HR model) for this activity''s avg_heart_rate, computed at import time from the athlete''s user_settings.max_heart_rate_bpm. Null when avg_heart_rate or max_heart_rate_bpm wasn''t available at import.';
COMMENT ON COLUMN completed_activities.hr_zone_low_bpm IS
  'Lower bpm bound of hr_zone at the time it was computed.';
COMMENT ON COLUMN completed_activities.hr_zone_high_bpm IS
  'Upper bpm bound of hr_zone at the time it was computed.';
