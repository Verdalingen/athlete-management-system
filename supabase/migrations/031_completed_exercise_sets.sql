-- 031: Stores actual completed per-set performance (weight, reps), matched back to the specific
-- planned exercise that produced it. Drives autoregulated weight progression: "last time you did
-- THIS exercise (e.g. paused bench specifically, not touch-and-go), here's what happened, so try
-- this weight next time" — replacing a static 1RM-derived formula that couldn't distinguish
-- between bench variants (paused vs touch-and-go vs close-grip all sharing one 1RM benchmark).
-- Grants come from migration 028's default privileges — no manual GRANT needed here.

CREATE TABLE completed_exercise_sets (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  exercise_id           UUID REFERENCES exercises(id) ON DELETE SET NULL,
  display_name          TEXT NOT NULL,
  garmin_category       TEXT,
  set_index             INTEGER NOT NULL,
  reps                  INTEGER NOT NULL,
  weight_kg             NUMERIC NOT NULL,
  prescribed_reps_min   INTEGER,
  prescribed_reps_max   INTEGER,
  created_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, date, exercise_id, set_index)
);

ALTER TABLE completed_exercise_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own completed exercise sets"
  ON completed_exercise_sets FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX completed_exercise_sets_user_date ON completed_exercise_sets (user_id, date DESC);
CREATE INDEX completed_exercise_sets_exercise ON completed_exercise_sets (exercise_id);
