CREATE TABLE IF NOT EXISTS body_weight_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  weight_kg   NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'garmin')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE body_weight_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own weight logs"
  ON body_weight_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS body_weight_log_user_date
  ON body_weight_log(user_id, date DESC);
