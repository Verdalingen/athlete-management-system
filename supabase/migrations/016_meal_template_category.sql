ALTER TABLE public.meal_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other'
  CHECK (category IN ('Breakfast','Pre-workout','Post-workout','Lunch','Dinner','Snack','Other'));
