-- 025: Completed Garmin activities (actual workouts, not planned sessions)
--
-- One row per completed activity, populated during Garmin sync. Surfaced on the
-- /plan calendar to show what actually happened alongside the planned schedule.

CREATE TABLE completed_activities (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id             BIGINT NOT NULL,
  date                    DATE NOT NULL,
  activity_type           TEXT,
  activity_name           TEXT,
  duration_secs           INTEGER,
  distance_meters         NUMERIC,
  avg_heart_rate          SMALLINT,
  max_heart_rate          SMALLINT,
  calories                INTEGER,
  activity_training_load  NUMERIC,
  created_at              TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, activity_id)
);

ALTER TABLE completed_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own completed activities"
  ON completed_activities FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX completed_activities_user_date ON completed_activities (user_id, date);
