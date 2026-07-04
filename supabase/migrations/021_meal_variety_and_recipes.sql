ALTER TABLE public.athlete_profile
  ADD COLUMN IF NOT EXISTS meal_variety_preference text
    DEFAULT 'balanced' CHECK (meal_variety_preference IN ('minimal', 'balanced', 'high'));

ALTER TABLE public.meal_templates
  ADD COLUMN IF NOT EXISTS prep_minutes integer CHECK (prep_minutes IS NULL OR prep_minutes > 0);
ALTER TABLE public.meal_templates
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' CHECK (source IN ('manual', 'ai_generated', 'imported_url'));
ALTER TABLE public.meal_templates
  ADD COLUMN IF NOT EXISTS source_url text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_profile TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_templates  TO service_role, authenticated;
