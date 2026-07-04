CREATE TABLE public.meal_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  servings     NUMERIC NOT NULL DEFAULT 1 CHECK (servings > 0),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.meal_template_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID REFERENCES public.meal_templates(id) ON DELETE CASCADE NOT NULL,
  food_name      TEXT NOT NULL,
  quantity_g     NUMERIC NOT NULL CHECK (quantity_g > 0),
  calories       NUMERIC NOT NULL DEFAULT 0,
  protein_g      NUMERIC NOT NULL DEFAULT 0,
  carbs_g        NUMERIC NOT NULL DEFAULT 0,
  fat_g          NUMERIC NOT NULL DEFAULT 0,
  fiber_g        NUMERIC NOT NULL DEFAULT 0,
  usda_fdc_id    INTEGER,
  custom_food_id UUID,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.meal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meal templates"
  ON public.meal_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Items are accessible through the template's RLS
CREATE POLICY "Users manage own meal template items"
  ON public.meal_template_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.meal_templates t
    WHERE t.id = template_id AND t.user_id = auth.uid()
  ));

CREATE INDEX meal_templates_user ON public.meal_templates(user_id, created_at DESC);
CREATE INDEX meal_template_items_template ON public.meal_template_items(template_id, sort_order);
