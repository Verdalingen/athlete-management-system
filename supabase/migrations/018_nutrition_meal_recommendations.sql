-- 018: AI-recommended meal per (user, date, meal_type). Either the web on-demand
-- generator or the LangGraph daily check-in can write these; the UI shows a
-- "Coach recommends" banner and lets the user log it as-is.

CREATE TABLE IF NOT EXISTS public.nutrition_meal_recommendations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date NOT NULL,
  meal_type     text NOT NULL CHECK (meal_type IN (
                  'breakfast','pre_workout','lunch','post_workout','dinner','snacks'
                )),
  name          text NOT NULL,
  description   text,
  ingredients   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{food_name, quantity_g, calories, protein_g, carbs_g, fat_g, fiber_g}]
  calories      int  NOT NULL,
  protein_g     numeric NOT NULL,
  carbs_g       numeric NOT NULL,
  fat_g         numeric NOT NULL,
  fiber_g       numeric DEFAULT 0,
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('checkin','manual')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date, meal_type)
);

CREATE INDEX IF NOT EXISTS nutrition_meal_recs_user_date
  ON public.nutrition_meal_recommendations (user_id, date);

ALTER TABLE public.nutrition_meal_recommendations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own meal recommendations"
    ON public.nutrition_meal_recommendations FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_meal_recommendations TO service_role, authenticated;
