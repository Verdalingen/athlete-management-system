-- 033: Sickness Watch signals (respiration, sleep-window stress, overnight
-- Body Battery recharge)
--
-- Adds three columns to daily_metrics powering the dashboard's SicknessWatchCard:
-- no single wearable metric reliably predicts oncoming illness alone, but HRV
-- suppression, elevated resting HR, elevated respiration rate, elevated sleep
-- stress, and a below-normal overnight Body Battery recharge moving together
-- is the pattern consumer wearables act on. See web/DESIGN.md.

ALTER TABLE daily_metrics
  ADD COLUMN respiration_avg NUMERIC,               -- Garmin avgRespirationRate (breaths/min)
  ADD COLUMN sleep_stress_avg SMALLINT,              -- Garmin avgSleepStress (0-100, sleep window only)
  ADD COLUMN body_battery_overnight_gain SMALLINT;   -- wake-time level minus sleep-start level
