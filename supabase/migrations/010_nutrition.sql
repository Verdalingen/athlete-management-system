-- Nutrition diary: one row per food item logged per meal
CREATE TABLE public.nutrition_diary (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date                    date NOT NULL,
  meal_type               text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snacks','pre_workout','post_workout','water')),
  food_name               text NOT NULL,
  brand                   text,
  quantity_g              numeric NOT NULL DEFAULT 100 CHECK (quantity_g > 0),
  -- macros
  calories                numeric NOT NULL DEFAULT 0,
  protein_g               numeric DEFAULT 0,
  carbs_g                 numeric DEFAULT 0,
  fat_g                   numeric DEFAULT 0,
  fiber_g                 numeric DEFAULT 0,
  sugar_g                 numeric DEFAULT 0,
  sodium_mg               numeric DEFAULT 0,
  -- vitamins (actual amount in this entry)
  vitamin_a_mcg           numeric,
  vitamin_c_mg            numeric,
  vitamin_d_mcg           numeric,
  vitamin_e_mg            numeric,
  vitamin_k_mcg           numeric,
  thiamin_mg              numeric,
  riboflavin_mg           numeric,
  niacin_mg               numeric,
  vitamin_b6_mg           numeric,
  folate_mcg              numeric,
  vitamin_b12_mcg         numeric,
  -- minerals
  calcium_mg              numeric,
  iron_mg                 numeric,
  magnesium_mg            numeric,
  phosphorus_mg           numeric,
  potassium_mg            numeric,
  zinc_mg                 numeric,
  copper_mg               numeric,
  -- fat breakdown
  saturated_fat_g         numeric,
  monounsaturated_fat_g   numeric,
  polyunsaturated_fat_g   numeric,
  omega3_g                numeric,
  cholesterol_mg          numeric,
  -- metadata
  usda_fdc_id             text,
  notes                   text,
  created_at              timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_nutrition_diary_user_date ON public.nutrition_diary (user_id, date);

ALTER TABLE public.nutrition_diary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own diary" ON public.nutrition_diary
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- Nutrition targets per training day type (coach-generated or user-set)
CREATE TABLE public.nutrition_targets (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day_type    text NOT NULL CHECK (day_type IN ('hard','easy','rest','race','default')),
  calories    numeric NOT NULL DEFAULT 2000,
  protein_g   numeric DEFAULT 150,
  carbs_g     numeric DEFAULT 200,
  fat_g       numeric DEFAULT 70,
  fiber_g     numeric DEFAULT 30,
  water_ml    numeric DEFAULT 2500,
  notes       text,
  source      text DEFAULT 'user' CHECK (source IN ('user','coach')),
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, day_type)
);

ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own targets" ON public.nutrition_targets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- Custom foods library
CREATE TABLE public.custom_foods (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                text NOT NULL,
  brand               text,
  serving_size_g      numeric NOT NULL DEFAULT 100,
  serving_unit        text DEFAULT 'g',
  -- per 100g values
  calories_per_100g   numeric NOT NULL DEFAULT 0,
  protein_per_100g    numeric DEFAULT 0,
  carbs_per_100g      numeric DEFAULT 0,
  fat_per_100g        numeric DEFAULT 0,
  fiber_per_100g      numeric DEFAULT 0,
  sugar_per_100g      numeric DEFAULT 0,
  sodium_per_100mg    numeric DEFAULT 0,
  vitamin_c_per_100mg numeric,
  vitamin_d_per_100mcg numeric,
  created_at          timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.custom_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own custom foods" ON public.custom_foods
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
