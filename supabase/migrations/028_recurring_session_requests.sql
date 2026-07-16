-- 028: Recurring session requests — specific sessions the athlete wants planned
-- around every week (e.g. "long run on Sunday"), as a structured list rather than
-- buried prose. Mirrors the existing `events` JSONB array column exactly.

ALTER TABLE public.athlete_profile
  ADD COLUMN IF NOT EXISTS recurring_session_requests jsonb DEFAULT '[]'::jsonb;
