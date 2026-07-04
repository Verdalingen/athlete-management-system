-- 017: Cached AI-generated weekly nutrition summaries (rollup stats are computed on read)

CREATE TABLE nutrition_weekly_insights (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,             -- Monday of the reviewed week (ISO)
  summary       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE nutrition_weekly_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition weekly insights"
  ON nutrition_weekly_insights FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX nutrition_weekly_insights_user_week ON nutrition_weekly_insights (user_id, week_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_weekly_insights TO service_role, authenticated;
