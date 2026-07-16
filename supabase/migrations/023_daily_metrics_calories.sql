-- 023: Daily caloric expenditure (from Garmin's get_stats API)
--
-- Adds Garmin's measured total/active/BMR calorie burn to daily_metrics,
-- enabling a real intake-vs-expenditure comparison against nutrition_diary.

ALTER TABLE daily_metrics
  ADD COLUMN total_calories  SMALLINT,  -- Garmin totalKilocalories (BMR + active)
  ADD COLUMN active_calories SMALLINT,  -- Garmin activeKilocalories
  ADD COLUMN bmr_calories    SMALLINT;  -- Garmin bmrKilocalories
