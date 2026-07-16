-- 029: Country + grocery store availability — lets meal recommendations suggest
-- ingredients that are actually realistic/available for the athlete to buy.

ALTER TABLE public.athlete_profile
  ADD COLUMN IF NOT EXISTS country text DEFAULT '',
  ADD COLUMN IF NOT EXISTS grocery_stores_notes text DEFAULT '';
