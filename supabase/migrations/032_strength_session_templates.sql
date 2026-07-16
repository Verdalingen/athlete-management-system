-- 032: Templated strength sessions. "Strength A/B/C" become fixed, athlete-owned exercise lists
-- (order, sets, reps) instead of something the LLM re-invents every planning run. Barbell bench is
-- the one exception (is_dynamic_bench=true): its sets/reps/rir are computed by a deterministic
-- wave function (services/supabase/bench_wave.py) instead of being stored here.

CREATE TABLE strength_session_templates (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot                  TEXT NOT NULL CHECK (slot IN ('A','B','C')),
  slot_name             TEXT NOT NULL,
  display_order         INTEGER NOT NULL,
  garmin_category       TEXT,
  garmin_exercise_key   TEXT,
  display_name          TEXT NOT NULL,
  sets                  INTEGER,
  reps_min              INTEGER,
  reps_max              INTEGER,
  rest_seconds          INTEGER NOT NULL DEFAULT 180,
  rir                   INTEGER,
  is_dynamic_bench      BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, slot, display_order)
);

ALTER TABLE strength_session_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own strength session templates"
  ON strength_session_templates FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX strength_session_templates_user_slot ON strength_session_templates (user_id, slot, display_order);

-- Anchor date for the deterministic bench wave (10s/8s/5s/3s, each held 4 weeks) — which week of
-- the 16-week cycle a given session date falls into is computed relative to this.
ALTER TABLE athlete_profile ADD COLUMN IF NOT EXISTS bench_wave_start_date DATE;
