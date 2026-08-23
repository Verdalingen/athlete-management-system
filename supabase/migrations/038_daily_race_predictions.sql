-- 038: Dense daily race-time predictions on daily_metrics.
--
-- Garmin recomputes a 5k/10k/half-marathon/marathon prediction every single day
-- (confirmed live: a 366-day ranged API call returns 366 entries), unlike bench
-- e1RM which only exists on days a bench session was logged. analyses.predicted_*_secs
-- (migration 037) stays check-in-sparse; these columns hold the dense daily series
-- the dashboard's evolution charts actually read from.

ALTER TABLE daily_metrics
  ADD COLUMN predicted_5k_secs INTEGER,
  ADD COLUMN predicted_10k_secs INTEGER,
  ADD COLUMN predicted_half_marathon_secs INTEGER,
  ADD COLUMN predicted_marathon_secs INTEGER;
