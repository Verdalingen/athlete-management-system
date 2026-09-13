-- 045: time_slot + combo_group_id — the schema foundation for scheduling more
-- than one session per calendar day.
--
-- Both scheduled_days and strength_sessions have always only had a
-- non-unique index on (user_id, date) — "one row per calendar day" was an
-- app-layer convention, never a DB constraint. That convention is what made
-- a 24h leg-spacing rule (see 044's SpacingConstraint work) a structural
-- no-op: two session types can't share a date, so any two different dates
-- are already >=24h apart under the day-granularity approximation, and the
-- rule can never actually bind either way. The athlete explicitly rejected
-- the one-session-per-day premise — this migration adds the identity that
-- lets more than one session share a date meaningfully: a time_slot
-- (morning/midday/afternoon/evening), defaulting to 'day' for every
-- existing row (asserts nothing false about history — 'day' means
-- "unslotted, single-session convention," mutually exclusive with any other
-- slot on the same date, i.e. today's behavior exactly). combo_group_id is
-- separate: a nullable grouping label for two sessions that are genuinely
-- one combined two-part block, not a new session shape — see the plan this
-- shipped under (multi-session-per-day scheduling).
--
-- Before applying to production: run
--   select user_id, date, count(*) from scheduled_days group by 1,2 having count(*) > 1;
--   select user_id, date, count(*) from strength_sessions group by 1,2 having count(*) > 1;
-- to confirm no existing accidental duplicates would break the new unique
-- index below.

ALTER TABLE scheduled_days ADD COLUMN time_slot TEXT NOT NULL DEFAULT 'day'
  CHECK (time_slot IN ('morning', 'midday', 'afternoon', 'evening', 'day'));
ALTER TABLE strength_sessions ADD COLUMN time_slot TEXT NOT NULL DEFAULT 'day'
  CHECK (time_slot IN ('morning', 'midday', 'afternoon', 'evening', 'day'));

ALTER TABLE scheduled_days ADD COLUMN combo_group_id UUID;
ALTER TABLE strength_sessions ADD COLUMN combo_group_id UUID;

-- Replaces the old non-unique (user_id, date) index with a real uniqueness
-- guarantee on (user_id, date, time_slot) — new; two sessions can never
-- validly share both slot and date (a genuine two-part combined session is
-- combo_group_id linking two DIFFERENT-slot rows, not two same-slot rows).
DROP INDEX IF EXISTS scheduled_days_date_idx;
CREATE UNIQUE INDEX scheduled_days_date_slot_uidx ON scheduled_days (user_id, date, time_slot);

DROP INDEX IF EXISTS strength_sessions_date_idx;
CREATE UNIQUE INDEX strength_sessions_date_slot_uidx ON strength_sessions (user_id, date, time_slot);

COMMENT ON COLUMN scheduled_days.time_slot IS
  'Which part of the day this session occupies. Default ''day'' = unslotted / single-session-per-date convention (mutually exclusive with any other slot on the same date). A real slot value (morning/midday/afternoon/evening) opts a date into holding more than one session.';
COMMENT ON COLUMN scheduled_days.combo_group_id IS
  'Nullable grouping label linking two rows (across scheduled_days/strength_sessions, in adjacent time_slots) that are one genuinely combined two-part session — not a new session shape, pure bookkeeping for UI/Garmin-naming purposes.';
