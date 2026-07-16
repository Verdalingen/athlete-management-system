-- Replace the single "reps" target with a rep range (reps_min/reps_max), since
-- Garmin's structured workout format doesn't display/enforce a rep target on the
-- watch anyway (athlete controls sets via lap button) — the range is purely for the
-- in-app plan display, where hypertrophy-style programming is naturally range-based.
alter table exercises add column if not exists reps_min integer;
alter table exercises add column if not exists reps_max integer;

update exercises set reps_min = reps, reps_max = reps where reps is not null;

alter table exercises drop column if exists reps;
