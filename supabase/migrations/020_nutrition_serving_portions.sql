-- 020: Optional piece/portion display fields alongside quantity_g, so the UI can
-- show "2 slices (56g)" instead of always "56g". quantity_g remains the sole
-- authoritative field for macro math everywhere — these two columns are purely
-- for display/entry convenience and are NULL whenever no natural unit applies
-- (e.g. rice, leafy greens).

ALTER TABLE public.nutrition_diary
  ADD COLUMN IF NOT EXISTS serving_qty   numeric CHECK (serving_qty IS NULL OR serving_qty > 0);
ALTER TABLE public.nutrition_diary
  ADD COLUMN IF NOT EXISTS serving_label text;

ALTER TABLE public.meal_template_items
  ADD COLUMN IF NOT EXISTS serving_qty   numeric CHECK (serving_qty IS NULL OR serving_qty > 0);
ALTER TABLE public.meal_template_items
  ADD COLUMN IF NOT EXISTS serving_label text;

-- meal_templates/meal_template_items have never had an explicit GRANT in any
-- prior migration (012, 016 both omit it) — the same class of bug hit in 017.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_diary     TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_templates      TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_template_items TO service_role, authenticated;
