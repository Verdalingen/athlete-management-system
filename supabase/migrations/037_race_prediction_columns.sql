-- 037: Dedicated historical columns for the 10K/half/marathon race predictions, matching
-- the existing predicted_5k_secs/bench_e1rm_kg pattern — these are what the dashboard's
-- full-history evolution charts read (kpis.race_predictions.* was never queryable as a
-- per-date trend since it's buried inside a JSONB blob per row, and until migration/CLI
-- key-name fix in the same change, it was also silently null on every row anyway).

ALTER TABLE analyses
  ADD COLUMN predicted_10k_secs INTEGER,
  ADD COLUMN predicted_half_marathon_secs INTEGER,
  ADD COLUMN predicted_marathon_secs INTEGER;
