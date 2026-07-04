-- 019: Add a compact micronutrient estimate to each meal recommendation so
-- "Use recommended" populates the micronutrients panel, not just macros.
ALTER TABLE public.nutrition_meal_recommendations
  ADD COLUMN IF NOT EXISTS micros jsonb NOT NULL DEFAULT '{}'::jsonb;
