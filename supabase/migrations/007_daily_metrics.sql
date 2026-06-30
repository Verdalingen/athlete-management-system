-- 007: Per-day metric time series for trend charts
--
-- Populated by the CLI after each Garmin extraction. One row per day.
-- Training load columns come from EWMA computed over activity loads.
-- Other columns come from Garmin's recovery / sleep / body battery APIs.

CREATE TABLE daily_metrics (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,

  -- Training load (EWMA over activity training-load scores)
  ctl             NUMERIC,        -- chronic training load  (28-day EWMA)
  atl             NUMERIC,        -- acute training load    (7-day EWMA)
  tsb             NUMERIC,        -- training stress balance = CTL - ATL
  acwr            NUMERIC(5,3),   -- acute:chronic workload ratio
  ramp_7d         NUMERIC,        -- weekly change in CTL
  monotony        NUMERIC(5,3),   -- training monotony (mean / SD of daily loads)
  strain          NUMERIC,        -- training strain

  -- Physiological (sparse: only written when Garmin emits a new estimate)
  vo2max_running  NUMERIC(5,1),
  vo2max_cycling  NUMERIC(5,1),

  -- Recovery (per night / per day from Garmin sleep & stress APIs)
  rhr             SMALLINT,         -- resting heart rate (bpm)
  hrv_overnight   NUMERIC(6,2),     -- overnight HRV (ms)
  sleep_score     SMALLINT,         -- Garmin sleep quality score (0-100)
  sleep_hours     NUMERIC(4,2),     -- total sleep (hours)
  sleep_deep_h    NUMERIC(4,2),     -- deep sleep (hours)
  sleep_rem_h     NUMERIC(4,2),     -- REM sleep (hours)
  stress_avg      SMALLINT,         -- avg daily stress level (0-100)

  -- Body battery
  body_battery    SMALLINT,         -- end-of-day body battery (0-100)

  -- Body
  weight_kg       NUMERIC(5,2),

  UNIQUE(user_id, date)
);

ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own daily metrics"
  ON daily_metrics FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX daily_metrics_user_date ON daily_metrics (user_id, date DESC);
