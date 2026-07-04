-- Add meal breakdown column so a logged meal template appears as one diary entry
-- with its individual ingredients stored for display/expansion.
ALTER TABLE public.nutrition_diary
  ADD COLUMN IF NOT EXISTS meal_items jsonb;

-- Explicit grants (belt-and-suspenders; matches live ACL already applied)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_diary  TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_targets TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_foods      TO service_role, authenticated;
