-- 008: athlete_profile and replan_jobs — captured from the live schema, not
-- newly designed. Both tables were created directly in the Supabase dashboard
-- before this project had a migrations directory (athlete_profile backs the
-- web app's setup wizard from the start; replan_jobs was already assumed to
-- exist by migration 026, which only fixed its grants). Running every file in
-- supabase/migrations/ against a fresh project produced neither table,
-- silently breaking setup for anyone but the original database. Columns,
-- constraints, RLS policy and indexes below were pulled from the live project
-- via the Supabase MCP.
--
-- Filed as 008 — the one number this sequence never used — rather than
-- appended at the end: migration 009 already ALTERs athlete_profile, so the
-- backfill has to sort before its first reference, not after the newest file.
--
-- athlete_profile only carries the columns no later migration adds. Columns
-- 021/024/028/029/032 add with ADD COLUMN IF NOT EXISTS could safely be
-- included here too (idempotent), but leaving them out lets each of those
-- migrations do the job its own comment describes instead of silently no-op'ing.
-- plan_anchor_mode is deliberately excluded even though it exists on the live
-- table: migration 039 ADDs it without IF NOT EXISTS, so it must originate
-- there, and migration 041 (correctly) drops it again on a fresh install — see
-- CLAUDE.md's note that 041's DROP was never actually run against production.

CREATE TABLE athlete_profile (
  id                          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_goal_type           TEXT,
  primary_goal_detail         TEXT,
  secondary_goals             TEXT,
  goal_timeline               TEXT,
  events                      JSONB DEFAULT '[]'::jsonb,
  training_years_strength     TEXT,
  training_years_cardio       TEXT,
  sport_background            TEXT,
  sessions_per_week           INTEGER,
  hours_per_week              DOUBLE PRECISION,
  bench_1rm_kg                DOUBLE PRECISION,
  squat_1rm_kg                DOUBLE PRECISION,
  deadlift_1rm_kg             DOUBLE PRECISION,
  run_5k_time                 TEXT,
  run_10k_time                TEXT,
  other_benchmarks            TEXT,
  available_days              TEXT[],
  session_duration_mins       INTEGER,
  gym_access                  BOOLEAN,
  equipment_notes             TEXT,
  schedule_notes              TEXT,
  current_injuries            TEXT,
  injury_history              TEXT,
  exercises_to_avoid          TEXT,
  health_notes                TEXT,
  preferred_style             TEXT,
  training_enjoyments         TEXT,
  training_dislikes           TEXT,
  indoor_outdoor              TEXT,
  additional_notes            TEXT,
  generated_analysis_context  TEXT,
  generated_planning_context  TEXT,
  context_generated_at        TIMESTAMPTZ,
  setup_completed             BOOLEAN DEFAULT false,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE athlete_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile"
  ON athlete_profile FOR ALL
  USING (auth.uid() = user_id);

CREATE TABLE replan_jobs (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL,
  type           TEXT NOT NULL
    CHECK (type IN ('daily', 'replan', 'seasonal', 'sync_kpis', 'shift')),
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'error')),
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  user_comment   TEXT,
  coach_feedback TEXT,
  params         JSONB
);

CREATE INDEX replan_jobs_status_created ON replan_jobs (status, created_at);

ALTER TABLE replan_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own replan jobs"
  ON replan_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
