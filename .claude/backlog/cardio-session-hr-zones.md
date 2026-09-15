---
title: Compute and store HR zone range for imported cardio sessions
status: in-progress
created: 2026-09-15
updated: 2026-09-15
tests: [tests/test_hr_zones.py, tests/test_completed_activities_hr_zone.py]
touches: [services/garmin/hr_zones.py, services/supabase/athlete_profile.py, services/supabase/plan_writer.py, supabase/migrations/046_completed_activities_hr_zone.sql]
depends_on:
attempts: 0
schedule_backend:
schedule_task_id:
schedule_created_at:
max_background_hours:
pr_url:
---

## Goal

Every imported session with HR data should get an HR zone/range computed from the athlete's max
HR, applied going forward (no backfill of existing rows).

There is currently no HR "intensity zones" concept anywhere in this codebase — `user_settings`
only stores a single flat `max_heart_rate_bpm` value (computed and written in
`cli/ams.py:853-867`, `_compute_max_heart_rate()`). This point introduces the zone model itself
(standard 5-zone % of max HR), not just the assignment logic — nothing to build on yet.

## Acceptance criteria

- [ ] A function computes 5 HR zone boundaries (in bpm) from a given max HR: Z1 50-60%, Z2 60-70%,
  Z3 70-80%, Z4 80-90%, Z5 90-100%.
- [ ] `completed_activities` gains new columns for the assigned zone and its bpm range (`hr_zone`,
  `hr_zone_low_bpm`, `hr_zone_high_bpm`) — a new numbered migration, per this repo's append-only
  convention (see root `CLAUDE.md`).
- [ ] When any imported session with a non-null `avg_heart_rate` is upserted (via
  `services/supabase/plan_writer.py`'s `upsert_completed_activities()`), its zone and range are
  computed from the athlete's current `max_heart_rate_bpm` and persisted alongside it — no
  restriction on `activity_type` (covers all cardio types, not just running, since zone
  computation only depends on having HR data, not the activity's type).
- [ ] If `max_heart_rate_bpm` is unset for the athlete at import time, the new fields are left
  null rather than guessed or defaulted to a wrong zone.
- [ ] No backfill of already-imported sessions — forward-only, by explicit decision.

## Notes

- 2026-09-15: created via `/point new`. No existing HR-zone concept in the schema at all — this
  point introduces the zone model (standard 5-zone % of max HR) as well as the per-session
  assignment. Considered %-of-LTHR and pulling Garmin's own zone config as alternatives; went
  with %-of-max-HR since `max_heart_rate_bpm` already exists and this needs no external
  dependency. Originally scoped to running only; expanded to all cardio types (gated on having
  `avg_heart_rate`, not on `activity_type`) and backfill was explicitly dropped.
- 2026-09-15: tests written and reviewed/approved, committed on `point/cardio-session-hr-zones`
  (commit `b94059f`) rather than `main` directly — `main` now has branch protection requiring a
  PR (added this same day), which the skill's default flow didn't anticipate. `run` should
  continue on this same branch rather than creating a fresh one off `main`.
