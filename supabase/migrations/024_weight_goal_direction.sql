ALTER TABLE public.athlete_profile
  ADD COLUMN IF NOT EXISTS weight_goal_direction text
    DEFAULT 'maintain' CHECK (weight_goal_direction IN ('lose', 'maintain', 'gain'));
