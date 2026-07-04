-- Per-day nutrition targets written by the LangGraph daily check-in and planning pipeline.
-- Takes priority over the generic day-type templates in nutrition_targets.

CREATE TABLE IF NOT EXISTS public.nutrition_daily_targets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date             date NOT NULL,
  calories         numeric NOT NULL,
  protein_g        numeric NOT NULL,
  carbs_g          numeric NOT NULL,
  fat_g            numeric NOT NULL,
  fiber_g          numeric NOT NULL DEFAULT 30,
  water_ml         numeric NOT NULL DEFAULT 3000,
  workout_context  text,   -- e.g. "Upper A strength 45min" — what session drove this
  notes            text,   -- coach rationale
  source           text NOT NULL DEFAULT 'checkin'
                   CHECK (source IN ('checkin', 'planner', 'manual')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS nutrition_daily_targets_user_date
  ON public.nutrition_daily_targets (user_id, date DESC);

ALTER TABLE public.nutrition_daily_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own daily targets"
    ON public.nutrition_daily_targets FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_daily_targets TO service_role, authenticated;
