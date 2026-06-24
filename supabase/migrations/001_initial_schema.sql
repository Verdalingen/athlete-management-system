-- Migration 001: Initial schema for Garmin AI Coach
-- Run this in the Supabase SQL editor.

-- ── plans ──────────────────────────────────────────────────────────────────
-- One row per replan run. Stores the full AI-generated markdown plan.
create table if not exists plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  created_at   timestamptz default now(),
  start_date   date not null,
  end_date     date not null,
  markdown     text
);

alter table plans enable row level security;

create policy "users manage their own plans"
  on plans for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── scheduled_days ─────────────────────────────────────────────────────────
-- One row per calendar day in the plan (all session types: run, strength, rest, cross).
create table if not exists scheduled_days (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid references plans on delete cascade not null,
  user_id      uuid references auth.users not null,
  date         date not null,
  session_type text not null,   -- "strength" | "run" | "rest" | "cross" | "race"
  focus        text,            -- "Bench Focus", "VO2max", "Easy", "Rest"
  description  text,            -- "4x(800m @ 3:50/km, 2min r)" — empty for rest
  is_key       boolean not null default false,
  is_rest      boolean not null default false
);

alter table scheduled_days enable row level security;

create policy "users manage their own scheduled_days"
  on scheduled_days for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index scheduled_days_date_idx on scheduled_days (user_id, date);

-- ── strength_sessions ──────────────────────────────────────────────────────
-- One row per strength session. Linked to both the plan and the Garmin workout.
create table if not exists strength_sessions (
  id                      uuid primary key default gen_random_uuid(),
  plan_id                 uuid references plans on delete cascade not null,
  user_id                 uuid references auth.users not null,
  date                    date not null,
  name                    text not null,          -- "Upper A", "Upper B", "Legs"
  garmin_workout_id       bigint,                 -- null until uploaded to Garmin
  estimated_duration_secs int not null default 3600
);

alter table strength_sessions enable row level security;

create policy "users manage their own strength_sessions"
  on strength_sessions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index strength_sessions_date_idx on strength_sessions (user_id, date);

-- ── exercises ──────────────────────────────────────────────────────────────
-- One row per exercise in a strength session.
create table if not exists exercises (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references strength_sessions on delete cascade not null,
  user_id             uuid references auth.users not null,
  display_order       int not null,
  garmin_category     text,
  garmin_exercise_key text,   -- "BARBELL_BENCH_PRESS" (exact FIT SDK key)
  display_name        text not null,
  sets                int not null,
  reps                int not null,
  rest_seconds        int not null default 180
);

alter table exercises enable row level security;

create policy "users manage their own exercises"
  on exercises for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Grant authenticated role access via the Data API (browser + JWT).
grant select, insert, update, delete
  on plans, scheduled_days, strength_sessions, exercises
  to authenticated;

-- Grant service_role explicit table access (bypasses RLS but still needs privileges).
grant select, insert, update, delete
  on public.plans, public.scheduled_days, public.strength_sessions, public.exercises
  to service_role;
