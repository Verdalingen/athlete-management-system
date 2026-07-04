-- Evening coach nudge: one per user per date, generated at ~8pm by cron.
CREATE TABLE IF NOT EXISTS public.nutrition_nudges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            date NOT NULL,
  message         text NOT NULL,
  tomorrow_session text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS nutrition_nudges_user_date
  ON public.nutrition_nudges (user_id, date DESC);

ALTER TABLE public.nutrition_nudges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own nudges"
    ON public.nutrition_nudges FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_nudges TO service_role, authenticated;
