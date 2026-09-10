-- ─────────────────────────────────────────────────────────────────────────────
-- Demo data — a fictional athlete, for screenshots and for exploring the app
-- without connecting a real Garmin account.
--
-- Why this exists: every page reads from Supabase, so a fresh clone shows empty
-- dashboards and tells you nothing about what the project does. This seeds one
-- self-contained demo athlete so the app can be run and understood immediately.
--
-- The demo user is a row in auth.users with NO usable password — it exists only
-- to satisfy the user_id foreign keys. You cannot log in as it, by design. To
-- view its data, log in as yourself and set DEMO_USER_ID (development only) —
-- see web/lib/supabase-server.ts.
--
-- Safe to re-run: it deletes its own rows first and touches nothing else.
-- To remove it entirely, run supabase/seed_demo_teardown.sql.
--
-- All values below are invented. Any resemblance to a real athlete's data is
-- coincidental.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 0. Reset any previous demo data ─────────────────────────────────────────
delete from completed_exercise_sets where user_id = '00000000-0000-4000-8000-000000000001';
delete from exercises              where user_id = '00000000-0000-4000-8000-000000000001';
delete from strength_sessions      where user_id = '00000000-0000-4000-8000-000000000001';
delete from scheduled_days         where user_id = '00000000-0000-4000-8000-000000000001';
delete from plans                  where user_id = '00000000-0000-4000-8000-000000000001';
delete from daily_metrics          where user_id = '00000000-0000-4000-8000-000000000001';
delete from completed_activities   where user_id = '00000000-0000-4000-8000-000000000001';
delete from analyses               where user_id = '00000000-0000-4000-8000-000000000001';
delete from weekly_reviews         where user_id = '00000000-0000-4000-8000-000000000001';
delete from replan_jobs            where user_id = '00000000-0000-4000-8000-000000000001';
delete from nutrition_diary        where user_id = '00000000-0000-4000-8000-000000000001';
delete from nutrition_daily_targets where user_id = '00000000-0000-4000-8000-000000000001';
delete from nutrition_targets      where user_id = '00000000-0000-4000-8000-000000000001';
delete from nutrition_meal_recommendations where user_id = '00000000-0000-4000-8000-000000000001';
delete from body_weight_log        where user_id = '00000000-0000-4000-8000-000000000001';
delete from athlete_profile        where user_id = '00000000-0000-4000-8000-000000000001';
delete from user_settings          where user_id = '00000000-0000-4000-8000-000000000001';

-- ── 1. The demo user (no password — cannot be logged into) ──────────────────
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo@athlete-management-system.invalid',
  '',                       -- empty hash: no password can ever match
  now(), now() - interval '180 days', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Jane Doe"}'::jsonb,
  false, '', '', '', ''
) on conflict (id) do nothing;

-- ── 2. Athlete profile ──────────────────────────────────────────────────────
insert into athlete_profile (
  user_id, events, primary_goal_type, primary_goal_detail, secondary_goals, goal_timeline,
  training_years_strength, training_years_cardio, sport_background,
  sessions_per_week, hours_per_week,
  bench_1rm_kg, squat_1rm_kg, deadlift_1rm_kg, run_5k_time, run_10k_time,
  available_days, session_duration_mins, gym_access,
  injury_history, preferred_style, training_enjoyments, training_dislikes,
  indoor_outdoor, weight_goal_direction, meal_variety_preference,
  country, setup_completed, generated_analysis_context, context_generated_at
) values (
  '00000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'name', 'Autumn 10 km', 'race_type', '10k', 'priority', 'A',
    'target_time', '00:43:30',
    'date', (date_trunc('week', current_date)::date + 5)::text)),
  'hybrid',
  'Sub-40 minute 10k and a 120 kg bench press within the year',
  'Keep bodyweight stable while both numbers move',
  '12 months',
  '2-3', '3-5',
  'Team sports through school, then four years of general gym work. Started structured running two years ago.',
  6, 7.5,
  102.5, 130, 160, '21:40', '45:10',
  array['monday','tuesday','wednesday','thursday','friday','saturday'],
  75, true,
  'Right patellar tendinopathy in 2024, resolved with loading. No current issues.',
  'balanced',
  'Interval sessions on the track, heavy pressing.',
  'Long steady rides indoors.',
  'outdoor_pref', 'maintain', 'balanced',
  'Norway', true,
  'ATHLETE PROFILE — HYBRID (STRENGTH + ENDURANCE)
Jane, 29. Targets a sub-40 10k alongside a 120 kg bench within 12 months.
Six sessions per week, roughly 7.5 hours. Bench 1RM 102.5 kg, 10k PB 45:10.
Concurrent-training conflict is the central constraint: leg work has to be
spaced away from quality running rather than simply reduced.',
  now() - interval '6 days'
);

insert into user_settings (user_id, max_heart_rate_bpm)
values ('00000000-0000-4000-8000-000000000001', 191);

-- ── 3. Daily metrics — a 3-month base build ────────────────────────────────
-- The Performance Management Chart should show real progressive overload, so
-- the numbers are generated from a training plan rather than drawn as curves:
--
--   * Periodised into 4-week mesocycles — three build weeks (x0.92, x1.03,
--     x1.15) then a deload (x0.65) — with each block 20% harder than the last.
--     Deload weeks also drop the Friday session.
--   * CTL/ATL/ACWR/TSB are *derived* from that daily load via rolling 28d/7d
--     windows. CTL therefore grows 2.6x across the block (about 21 -> 56),
--     which only happens because ACWR sits above 1.0 on 67 of 120 days.
--     Shallow, sustained overload is what builds CTL; deep deloads and brief
--     ACWR spikes leave it flat, which is the mistake this data avoids.
--   * TSB swings roughly -18 to +16 and ACWR spans 0.62 to 1.37, so the chart
--     visits the underload, optimal and high-risk zones.
--   * Recovery metrics respond to accumulated fatigue (ATL above CTL): HRV
--     suppressed and RHR elevated in hard weeks, rebounding on deload. Fitness
--     markers move with the build too — VO2max 47.0 -> 52.8, 10k prediction
--     49:10 -> 43:56, RHR 55 -> 45.
--   * Rest days carry a small non-zero load. With exactly 0, the 7-day window
--     drops and adds the same value and ATL flat-lines across every weekend.
--   * Noise is deterministic (md5 of the date), so re-running yields identical
--     data — reproducible, unlike random().
insert into daily_metrics (
  user_id, date, ctl, atl, tsb, acwr, ramp_7d, monotony, strain,
  vo2max_running, rhr, hrv_overnight, sleep_score, sleep_hours,
  sleep_deep_h, sleep_rem_h, stress_avg, body_battery, weight_kg,
  total_calories, active_calories, bmr_calories, respiration_avg,
  sleep_stress_avg, body_battery_overnight_gain,
  predicted_5k_secs, predicted_10k_secs, predicted_half_marathon_secs, predicted_marathon_secs
)
with days as (
  select d::date as date, (row_number() over (order by d) - 1)::numeric as n,
         floor((d::date - date_trunc('week', current_date - interval '119 days')::date) / 7.0) as wk
  from generate_series(current_date - interval '119 days', current_date, interval '1 day') as g(d)
),
r as (
  select date, n, wk, (wk::int % 4) as wib,
    case (wk::int % 4) when 0 then 0.92 when 1 then 1.03 when 2 then 1.15 else 0.65 end
      * power(1.20, floor(wk/4)) as mult,
    (('x'||substr(md5(date::text||'load'),1,7))::bit(28)::int)/268435455.0 as r_load,
    (('x'||substr(md5(date::text||'skip'),1,7))::bit(28)::int)/268435455.0 as r_skip,
    (('x'||substr(md5(date::text||'hrv' ),1,7))::bit(28)::int)/268435455.0 as r_hrv,
    (('x'||substr(md5(date::text||'rhr' ),1,7))::bit(28)::int)/268435455.0 as r_rhr,
    (('x'||substr(md5(date::text||'slp' ),1,7))::bit(28)::int)/268435455.0 as r_slp,
    (('x'||substr(md5(date::text||'wt'  ),1,7))::bit(28)::int)/268435455.0 as r_wt,
    (('x'||substr(md5(date::text||'bb'  ),1,7))::bit(28)::int)/268435455.0 as r_bb,
    (('x'||substr(md5(date::text||'vo2' ),1,7))::bit(28)::int)/268435455.0 as r_vo2,
    (('x'||substr(md5(date::text||'str' ),1,7))::bit(28)::int)/268435455.0 as r_str
  from days
),
l as (
  select r.*,
    case when r_skip < 0.06 then r_load * 5 else
      (case extract(dow from date)
         when 0 then case when r_skip > 0.88 then 26 + r_load*12 else r_load * 7 end
         when 1 then 22 + r_load*7
         when 2 then 30 + r_load*10
         when 3 then 22 + r_load*7
         when 4 then 52 + r_load*16
         when 5 then (22 + r_load*7) * case when wib = 3 then 0.35 else 1 end
         else 58 + r_load*18
       end) * mult
    end as load
  from r
),
w as (
  select l.*,
    avg(load)         over (order by date rows between 27 preceding and current row) as ctl,
    avg(load)         over (order by date rows between  6 preceding and current row) as atl,
    stddev_samp(load) over (order by date rows between  6 preceding and current row) as sd7,
    avg(load)         over (order by date rows between 34 preceding and 7 preceding) as ctl_prev
  from l
),
m as (
  select w.*,
    greatest(0, atl - ctl) as fatigue,
    greatest(4.6, least(9.4, 7.05 + (r_slp - 0.5) * 2.1
      + case when extract(dow from date) in (0,6) then 0.5 else 0 end
      - case when r_skip < 0.07 then 1.4 else 0 end)) as sleep_h
  from w
)
select
  '00000000-0000-4000-8000-000000000001', date,
  round(ctl::numeric, 1), round(atl::numeric, 1), round((ctl - atl)::numeric, 1),
  round((atl / nullif(ctl,0))::numeric, 2),
  round((ctl - coalesce(ctl_prev, ctl))::numeric, 1),
  round((atl / nullif(sd7,0))::numeric, 2),
  round((atl * 7 * (atl / nullif(sd7,0)))::numeric, 0),
  round((47.1 + n * 0.048 + (r_vo2 - 0.5) * 0.30)::numeric, 1),
  round(49.4 - n * 0.031 + (r_rhr - 0.5) * 2.8 + fatigue * 0.22
        + case when r_rhr > 0.96 then 4 else 0 end)::int::smallint,
  round((59.5 + n * 0.095 + (r_hrv - 0.5) * 11.0 - fatigue * 0.80
        - case when r_hrv < 0.05 then 9 else 0 end)::numeric, 1),
  round(greatest(24, least(97, 36 + sleep_h * 6.2 + (r_slp - 0.5) * 15 - fatigue * 0.5)))::int::smallint,
  round(sleep_h::numeric, 1),
  round((sleep_h * (0.155 + (r_bb - 0.5) * 0.05))::numeric, 2),
  round((sleep_h * (0.215 + (r_str - 0.5) * 0.065))::numeric, 2),
  round(20 + (r_str - 0.5) * 16 + fatigue * 0.45 + load * 0.05)::int::smallint,
  round(greatest(18, least(96, 76 - load * 0.20 + (r_bb - 0.5) * 18 - fatigue * 0.8)))::int::smallint,
  round((78.9 - n * 0.0075 + (r_wt - 0.5) * 1.1)::numeric, 1),
  round(1980 + load * 7.4 + (r_load - 0.5) * 270)::int::smallint,
  round(load * 7.4 + 200 + (r_load - 0.5) * 180)::int::smallint,
  1980::smallint,
  round((14.1 + (r_str - 0.5) * 2.2 + fatigue * 0.035)::numeric, 1),
  round(16 + (r_slp - 0.5) * 12 + fatigue * 0.38)::int::smallint,
  round(greatest(22, least(88, 60 + (r_bb - 0.5) * 22 - fatigue * 0.75 + (sleep_h - 7) * 4)))::int::smallint,
  round(1421 - n * 1.16 + (r_vo2 - 0.5) * 11)::int,
  round(2954 - n * 2.62 + (r_vo2 - 0.5) * 24)::int,
  round(6580 - n * 5.6 + (r_vo2 - 0.5) * 55)::int,
  round(13880 - n * 11.2 + (r_vo2 - 0.5) * 125)::int
from m;

-- ── 4. Completed activities — the same build, so the log agrees ────────────
-- Weekly volume grows with the block (about 6.1 -> 7.8 h and 31 -> 39 km in
-- build weeks); deload weeks drop Friday, downgrade the interval session to an
-- easy run, and run at lower heart rates.
insert into completed_activities (
  user_id, activity_id, date, activity_type, activity_name,
  duration_secs, distance_meters, avg_heart_rate, max_heart_rate, calories, activity_training_load
)
with r as (
  select d::date as date, i,
    floor((d::date - date_trunc('week', current_date - interval '119 days')::date) / 7.0) as wk,
    (('x'||substr(md5(d::text||'act' ),1,7))::bit(28)::int)/268435455.0 as ra,
    (('x'||substr(md5(d::text||'skip'),1,7))::bit(28)::int)/268435455.0 as rs,
    (('x'||substr(md5(d::text||'hr'  ),1,7))::bit(28)::int)/268435455.0 as rh
  from generate_series(current_date - interval '89 days', current_date - interval '1 day', interval '1 day') with ordinality as g(d, i)
),
k as (
  select *, extract(dow from date) as dw, (wk::int % 4) as wib,
    case (wk::int % 4) when 0 then 0.92 when 1 then 1.03 when 2 then 1.15 else 0.65 end
      * power(1.20, floor(wk/4)) as mult
  from r
  where rs >= 0.06
    and (extract(dow from date) <> 0 or rs > 0.88)
    and not (extract(dow from date) = 5 and (wk::int % 4) = 3)
),
s as (select *, (0.60 + mult * 0.30) as dscale from k)
select
  '00000000-0000-4000-8000-000000000001',
  9000000000 + i, date,
  case when dw in (2,4,6) or dw = 0 then 'running' else 'strength_training' end,
  case dw when 2 then 'Easy run'
          when 4 then case when wib = 3 then 'Easy run (deload)' else 'Track intervals' end
          when 6 then 'Long run' when 0 then 'Recovery jog' else 'Strength session' end,
  round((case dw when 2 then 2400 + ra*600 when 4 then 2900 + ra*600 when 6 then 4200 + ra*1400
                 when 0 then 1800 + ra*600 else 3600 + ra*1100 end) * dscale)::int,
  case when dw in (2,4,6,0)
       then round((case dw when 2 then 7200 + ra*1700 when 4 then 8400 + ra*1600
                           when 6 then 13500 + ra*3800 else 4900 + ra*1600 end) * dscale)::numeric
       else null end,
  round((case dw when 2 then 138 + rh*10 when 4 then 163 + rh*9 when 6 then 146 + rh*10
                 when 0 then 131 + rh*8 else 112 + rh*13 end)
        - case when wib = 3 then 7 else 0 end)::int::smallint,
  round((case dw when 2 then 152 + rh*11 when 4 then 180 + rh*9 when 6 then 166 + rh*10
                 when 0 then 145 + rh*8 else 141 + rh*14 end)
        - case when wib = 3 then 8 else 0 end)::int::smallint,
  round((case dw when 2 then 470 + ra*150 when 4 then 580 + ra*170 when 6 then 900 + ra*300
                 when 0 then 330 + ra*120 else 320 + ra*130 end) * dscale)::int,
  round(((case dw when 2 then 30 + ra*10 when 4 then 52 + ra*16 when 6 then 58 + ra*18
                  when 0 then 26 + ra*12 else 22 + ra*7 end) * mult)::numeric, 1)
from s;

-- ── 5. The plan: 28 days, starting last Monday ─────────────────────────────
insert into plans (id, user_id, start_date, end_date, markdown)
values (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000001',
  date_trunc('week', current_date)::date - 7,
  date_trunc('week', current_date)::date + 20,
  '# Taper, race, and return to base

Week 1 tapers into Saturday''s 10 km. Volume drops about 45% from the peak week
while intensity is held — short race-pace work Thursday, full rest Friday.
Week 2 is post-race recovery, then two weeks rebuilding base.

Chronic load peaked at 61 in the block just finished; the taper trades a few
points of CTL for a form swing from -8 to +21.'
);

-- The plan mirrors where the athlete is in the season: taper (week 0), race
-- week (week 1, race on the Saturday), post-race recovery (week 2), then base
-- rebuild (week 3). Without this the plan page would show a generic build block
-- while every chart next to it shows a taper.
insert into scheduled_days (plan_id, user_id, date, session_type, focus, description, is_key, is_rest)
with d as (
  select g::date as date,
         floor((g::date - (date_trunc('week', current_date)::date - 7)) / 7)::int as pw,
         extract(dow from g)::int as dw
  from generate_series(date_trunc('week', current_date)::date - 7,
                       date_trunc('week', current_date)::date + 20, interval '1 day') as g
)
select
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000001',
  date,
  case
    when pw = 1 and dw = 6 then 'race'
    when dw in (1,3,5) and not (pw = 1 and dw = 5) and not (pw = 2 and dw = 1) then 'strength'
    when dw = 0 or (pw = 1 and dw = 5) or (pw = 2 and dw = 1) then 'rest'
    else 'run' end,
  case pw
    when 0 then case dw when 1 then 'Taper — Slot A (reduced volume)' when 2 then 'Easy aerobic'
                        when 3 then 'Taper — Slot B (reduced volume)' when 4 then 'Sharpening intervals'
                        when 5 then 'Taper — Slot C (light)' when 6 then 'Long run (shortened)'
                        else 'Rest' end
    when 1 then case dw when 1 then 'Race week — Slot A (openers)' when 2 then 'Shakeout'
                        when 3 then 'Race week — Slot B (light)' when 4 then 'Race-pace primer'
                        when 5 then 'Rest — pre-race' when 6 then 'RACE — 10 km'
                        else 'Rest' end
    when 2 then case dw when 1 then 'Rest — post-race' when 2 then 'Recovery jog'
                        when 3 then 'Return to lifting — Slot A' when 4 then 'Easy aerobic'
                        when 5 then 'Slot B' when 6 then 'Easy long run'
                        else 'Rest' end
    else        case dw when 1 then 'Base rebuild — Slot A (legs)' when 2 then 'Easy aerobic'
                        when 3 then 'Base rebuild — Slot B (legs)' when 4 then 'VO2max intervals'
                        when 5 then 'Base rebuild — Slot C (upper)' when 6 then 'Long run'
                        else 'Rest' end
  end,
  case pw
    when 0 then case dw when 2 then '35 min easy @ 5:45/km'
                        when 4 then '4 x (800 m @ 3:52/km, 2:30 jog) — volume down, intensity held'
                        when 6 then '70 min steady @ 5:25/km' else '' end
    when 1 then case dw when 2 then '25 min shakeout @ 5:50/km, 4 x 20 s strides'
                        when 4 then '3 x (600 m @ 10k race pace, 3:00 jog)'
                        when 6 then '10 km race — target 43:30 (4:21/km). Warm up 20 min + strides.'
                        else '' end
    when 2 then case dw when 2 then '30 min very easy @ 6:00/km'
                        when 4 then '40 min easy @ 5:45/km'
                        when 6 then '60 min easy @ 5:40/km' else '' end
    else        case dw when 2 then '50 min easy @ 5:40/km'
                        when 4 then '5 x (1000 m @ 3:55/km, 2:30 jog)'
                        when 6 then '85 min steady @ 5:20/km' else '' end
  end,
  (pw = 1 and dw in (4,6)) or (pw = 0 and dw = 4) or (pw = 3 and dw in (4,6)),
  dw = 0 or (pw = 1 and dw = 5) or (pw = 2 and dw = 1)
from d;

-- ── 6. Strength sessions + exercises for each pressing day ─────────────────
insert into strength_sessions (id, plan_id, user_id, date, name, estimated_duration_secs, slot)
select
  md5('sess' || d::text)::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000001',
  d::date,
  case extract(dow from d) when 1 then 'Slot A — Bench + Legs'
                           when 3 then 'Slot B — Bench + Legs'
                           else 'Slot C — Bench + Upper' end,
  4500,
  case extract(dow from d) when 1 then 'A' when 3 then 'B' else 'C' end
from generate_series(
  date_trunc('week', current_date)::date - 7,
  date_trunc('week', current_date)::date + 20,
  interval '1 day') as g(d)
where extract(dow from d) in (1, 3, 5)
  -- race week drops Friday; the Monday after the race is full rest
  and d::date not in (date_trunc('week', current_date)::date + 4,
                      date_trunc('week', current_date)::date + 7);

insert into exercises (session_id, user_id, display_order, garmin_category, garmin_exercise_key, display_name, sets, reps_min, reps_max, rest_seconds, rir)
select s.id, s.user_id, t.ord, t.cat, t.ekey, t.nm, t.sets, t.rmin, t.rmax, t.rest, t.rir
from strength_sessions s
cross join (values
  (1, 'BENCH_PRESS', 'BARBELL_BENCH_PRESS', 'Barbell Bench Press', 5, 3, 5, 210, 1),
  (2, 'SQUAT', 'BARBELL_BACK_SQUAT', 'Barbell Back Squat', 4, 5, 8, 180, 2),
  (3, 'ROW', 'BARBELL_ROW', 'Barbell Row', 4, 6, 8, 150, 2),
  (4, 'LUNGE', 'WALKING_LUNGE', 'Walking Lunge', 3, 10, 12, 120, 2),
  (5, 'SHOULDER_PRESS', 'DUMBBELL_SHOULDER_PRESS', 'Dumbbell Shoulder Press', 3, 8, 10, 120, 2),
  (6, 'PLANK', 'PLANK', 'Plank', 3, 45, 60, 60, null)
) as t(ord, cat, ekey, nm, sets, rmin, rmax, rest, rir)
where s.user_id = '00000000-0000-4000-8000-000000000001' and s.slot in ('A','B');

insert into exercises (session_id, user_id, display_order, garmin_category, garmin_exercise_key, display_name, sets, reps_min, reps_max, rest_seconds, rir)
select s.id, s.user_id, t.ord, t.cat, t.ekey, t.nm, t.sets, t.rmin, t.rmax, t.rest, t.rir
from strength_sessions s
cross join (values
  (1, 'BENCH_PRESS', 'BARBELL_BENCH_PRESS', 'Barbell Bench Press', 5, 2, 4, 240, 1),
  (2, 'BENCH_PRESS', 'DUMBBELL_BENCH_PRESS', 'Dumbbell Bench Press', 4, 8, 10, 150, 2),
  (3, 'PULL_UP', 'PULL_UP', 'Pull-up', 4, 6, 9, 150, 2),
  (4, 'SHOULDER_PRESS', 'BARBELL_OVERHEAD_PRESS', 'Overhead Press', 4, 5, 7, 180, 2),
  (5, 'ROW', 'CABLE_ROW', 'Seated Cable Row', 3, 10, 12, 120, 2),
  (6, 'CURL', 'DUMBBELL_BICEPS_CURL', 'Dumbbell Curl', 3, 10, 12, 90, 1)
) as t(ord, cat, ekey, nm, sets, rmin, rmax, rest, rir)
where s.user_id = '00000000-0000-4000-8000-000000000001' and s.slot = 'C';

-- Sessions inside the upload window are marked as pushed to Garmin, which is
-- what makes the green "Garmin" badge appear in the session detail modal.
-- Later sessions stay null: not uploaded yet. The ids are decorative — the UI
-- only checks for presence and never links out.
update strength_sessions set garmin_workout_id = 812000000 + (('x'||substr(md5(date::text),1,6))::bit(24)::int)
where user_id = '00000000-0000-4000-8000-000000000001' and date <= current_date + 7;

update scheduled_days set garmin_workout_id = 813000000 + (('x'||substr(md5(date::text),1,6))::bit(24)::int)
where user_id = '00000000-0000-4000-8000-000000000001'
  and date <= current_date + 7 and session_type in ('run','race');

-- ── 7. Logged bench sets — drives the e1RM progression chart ───────────────
insert into completed_exercise_sets (user_id, date, exercise_id, display_name, garmin_category, set_index, reps, weight_kg, prescribed_reps_min, prescribed_reps_max)
select
  '00000000-0000-4000-8000-000000000001',
  s.date,
  e.id,
  'Barbell Bench Press',
  'BENCH_PRESS',
  gs.set_index,
  case when gs.set_index <= 2 then 5 else 4 end,
  round((72.0 + (s.date - (current_date - 60)) * 0.155
        + ((('x'||substr(md5(s.date::text||'lift'),1,7))::bit(28)::int)/268435455.0 - 0.5) * 4.4)::numeric, 1),
  3, 5
from strength_sessions s
join exercises e on e.session_id = s.id and e.display_order = 1
cross join generate_series(1, 4) as gs(set_index)
where s.user_id = '00000000-0000-4000-8000-000000000001'
  and s.date < current_date
  and s.date >= current_date - 84;

-- Older bench history, so the lift-progression view has more than the current block.
-- (user_id, date, exercise_id, set_index) is unique, hence ON CONFLICT.
insert into completed_exercise_sets (user_id, date, exercise_id, display_name, garmin_category, set_index, reps, weight_kg, prescribed_reps_min, prescribed_reps_max)
select
  '00000000-0000-4000-8000-000000000001',
  d::date,
  (select e.id from exercises e join strength_sessions s on s.id = e.session_id
    where e.user_id = '00000000-0000-4000-8000-000000000001' and e.display_order = 1 and s.slot = 'A' limit 1),
  'Barbell Bench Press', 'BENCH_PRESS',
  gs.set_index,
  case when gs.set_index <= 2 then 5 else 4 end,
  round((72.0 + (d::date - (current_date - 60)) * 0.155
        + ((('x'||substr(md5(d::date::text||'lift'),1,7))::bit(28)::int)/268435455.0 - 0.5) * 4.4)::numeric, 1),
  3, 5
from generate_series(current_date - interval '59 days', current_date - interval '9 days', interval '1 day') as g(d)
cross join generate_series(1, 4) as gs(set_index)
where extract(dow from d) in (1, 3, 5)
on conflict do nothing;

-- ── 8. Analyses — the report page and the dashboard KPI strip ─────────────
-- The kpis blob is read straight from daily_metrics for the same date rather
-- than hardcoded, so the readiness pills can never contradict the chart sitting
-- next to them. Readiness is derived from form and HRV, which makes it climb
-- through the taper (44 -> 70 -> 84) the way it should.
insert into analyses (user_id, report_date, created_at, updated_at, bench_e1rm_kg,
                      predicted_5k_secs, predicted_10k_secs, predicted_half_marathon_secs,
                      predicted_marathon_secs, max_heart_rate_bpm, kpis, analysis_html)
select
  '00000000-0000-4000-8000-000000000001',
  d.date,
  now() - (w * interval '7 days'),
  now() - (w * interval '7 days'),
  round((108.6 - w * 1.35 + (rr - 0.5) * 1.9)::numeric, 1),
  -- kept in step with daily_metrics' predictions so the report page and the
  -- trends page don't contradict each other
  round(1283 + w * 8.2  + (rr - 0.5) * 9)::int,
  round(2642 + w * 18.5 + (rr - 0.5) * 20)::int,
  round(5914 + w * 39   + (rr - 0.5) * 45)::int,
  round(12547 + w * 78  + (rr - 0.5) * 105)::int,
  191,
  jsonb_build_object(
    'training_load', jsonb_build_object(
        'ctl', d.ctl, 'atl', d.atl, 'tsb', d.tsb, 'acwr_uncoupled', d.acwr),
    'training_readiness', jsonb_build_object(
        'score', greatest(20, least(99, round(58 + d.tsb * 0.9 + (d.hrv_overnight - 64) * 0.5)))),
    'body_battery', jsonb_build_object('latest', d.body_battery),
    'hrv',   jsonb_build_object('weekly_avg', wk.hrv_avg),
    'sleep', jsonb_build_object('avg_total_hours', wk.sleep_avg)),
  case when w = 0 then
    '<section><h2>Weekly check-in — race week</h2><p>The taper is doing what it should. Chronic load has come down about 8 points from its peak, acute load has more than halved, and form has swung from -8 to +21 in two weeks. That is the trade being made deliberately: a little fitness given back for a lot of freshness.</p><h3>Running</h3><p>Race-pace work on Thursday held 4:19/km at a heart rate 6 bpm below the same session three weeks ago. The 10 km prediction has come down to 43:56 across the block, from 49:10 at the start of the base phase.</p><h3>Strength</h3><p>Pressing volume is reduced but intensity retained through race week. Estimated bench 1RM is unchanged at 108.7 kg, which is the intent during a taper rather than a stall.</p><h3>Recovery</h3><p>Overnight HRV has climbed from a mid-block average of 60 ms to 74 ms, and resting heart rate is at its lowest of the season.</p><h3>Race</h3><p>Target 43:30 (4:21/km) on Saturday.</p></section>'
  else
    '<section><h2>Weekly check-in</h2><p>Load is tracking where it should. Chronic load rose again this week and the acute:chronic ratio stayed inside the intended band, so the block continues as written.</p><h3>Running</h3><p>Interval pace held to target across all reps, with the last rep the fastest — a durability signal rather than a pacing error.</p><h3>Strength</h3><p>Bench wave progressed as scheduled. Leg volume stayed on slots A and B, clear of both quality runs.</p><h3>Recovery</h3><p>Overnight HRV dipped mid-block and has since recovered above baseline.</p></section>'
  end
from generate_series(0, 5) as g(w)
join daily_metrics d
  on d.user_id = '00000000-0000-4000-8000-000000000001'
 and d.date = (current_date - (w * 7))::date
cross join lateral (
  select round(avg(hrv_overnight), 1) as hrv_avg, round(avg(sleep_hours), 2) as sleep_avg
  from daily_metrics x
  where x.user_id = d.user_id and x.date > d.date - 7 and x.date <= d.date
) wk
cross join lateral (
  select ((('x'||substr(md5(((current_date - (w*7))::date)::text||'e1rm'),1,7))::bit(28)::int)/268435455.0) as rr
) e;

insert into weekly_reviews (user_id, week_start, summary_html, kpi_delta)
values (
  '00000000-0000-4000-8000-000000000001',
  date_trunc('week', current_date)::date - 7,
  '<p>Six of six sessions completed. Interval session was the standout; long run was '
  'cut 10 minutes short but the quality target was still met.</p>',
  '{"ctl": 2.4, "bench_e1rm_kg": 1.5, "predicted_10k_secs": -18}'::jsonb
);

-- ── 9. Nutrition ───────────────────────────────────────────────────────────
insert into nutrition_targets (user_id, day_type, calories, protein_g, carbs_g, fat_g, fiber_g, water_ml, source)
values
  ('00000000-0000-4000-8000-000000000001', 'hard',    3150, 175, 400, 88, 34, 3300, 'coach'),
  ('00000000-0000-4000-8000-000000000001', 'easy',    2800, 170, 330, 82, 32, 3000, 'coach'),
  ('00000000-0000-4000-8000-000000000001', 'rest',    2500, 165, 260, 78, 30, 2700, 'coach'),
  ('00000000-0000-4000-8000-000000000001', 'default', 2850, 170, 340, 82, 32, 3000, 'coach');

insert into nutrition_daily_targets (user_id, date, calories, protein_g, carbs_g, fat_g, fiber_g, water_ml, workout_context, source)
select
  '00000000-0000-4000-8000-000000000001',
  d::date,
  case extract(dow from d) when 4 then 3150 when 6 then 3200 when 0 then 2500 else 2850 end,
  175,
  case extract(dow from d) when 4 then 400 when 6 then 410 when 0 then 260 else 340 end,
  82, 32, 3000,
  case extract(dow from d) when 4 then 'VO2max intervals — 9.6 km'
                           when 6 then 'Long run — 17 km'
                           when 0 then 'Rest day'
                           else 'Strength session' end,
  'checkin'
from generate_series(current_date - interval '20 days', current_date + interval '2 days', interval '1 day') as g(d);

insert into nutrition_diary (user_id, date, meal_type, food_name, brand, quantity_g,
                             calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
                             serving_qty, serving_label)
select '00000000-0000-4000-8000-000000000001', d::date, m.meal_type, m.food_name, m.brand,
       m.qty, m.kcal, m.p, m.c, m.f, m.fib, m.sug, m.sod, m.sqty, m.slabel
from generate_series(current_date - interval '13 days', current_date, interval '1 day') as g(d)
cross join (values
  ('breakfast',    'Rolled oats',            null,          80,  304, 10.6, 51.8, 5.4, 8.0, 0.8,  5, null, null),
  ('breakfast',    'Skyr, natural',          'Tine',       200,  126, 22.0,  8.0, 0.4, 0.0, 8.0, 60, null, null),
  ('breakfast',    'Banana',                 null,         118,  105,  1.3, 27.0, 0.4, 3.1, 14.4, 1, 1, 'medium'),
  ('lunch',        'Chicken breast, grilled',null,         180,  297, 55.8,  0.0, 6.5, 0.0, 0.0, 133, null, null),
  ('lunch',        'Brown rice, cooked',     null,         220,  242,  5.6, 50.6, 1.9, 3.1, 0.5, 11, null, null),
  ('lunch',        'Mixed salad + olive oil',null,         150,  138,  1.8,  6.2, 12.1, 2.4, 3.0, 22, null, null),
  ('post_workout', 'Whey protein isolate',   'Proteinfabrikken', 35, 130, 28.0, 2.1, 0.9, 0.0, 1.2, 60, 1, 'scoop'),
  ('dinner',       'Salmon fillet, baked',   null,         170,  354, 38.6,  0.0, 21.4, 0.0, 0.0, 98, null, null),
  ('dinner',       'Potatoes, boiled',       null,         280,  241,  5.6, 54.3, 0.3, 5.0, 2.2, 17, null, null),
  ('dinner',       'Broccoli, steamed',      null,         160,   55,  4.5,  7.9, 0.6, 4.2, 2.0, 51, null, null),
  ('snacks',       'Almonds',                null,          30,  174,  6.4,  6.5, 15.0, 3.8, 1.2, 0, null, null)
) as m(meal_type, food_name, brand, qty, kcal, p, c, f, fib, sug, sod, sqty, slabel);

insert into body_weight_log (user_id, date, weight_kg, source)
select '00000000-0000-4000-8000-000000000001', d::date,
       round((78.4 - (current_date - d::date) * 0.006)::numeric, 1),
       'garmin'
from generate_series(current_date - interval '56 days', current_date, interval '7 days') as g(d);

-- ── 9b. Guarantee today is a strength day ──────────────────────────────────
-- The dashboard hero card only renders its Exercise / Sets x Reps / Rest /
-- Intensity table when the day has a strength session; a run day shows just a
-- one-line description. Since the plan lifts on Mon/Wed/Fri, seeding on any
-- other weekday would leave the first screen a new clone sees looking empty.
-- So if today isn't already a lifting day, trade it with the nearest earlier
-- one — moving the session and its exercises, and swapping the plan entries
-- both ways so no day ends up duplicated or blank. Re-running is a no-op.
do $$
declare
  demo constant uuid := '00000000-0000-4000-8000-000000000001';
  src  date;
  a    scheduled_days%rowtype;
  b    scheduled_days%rowtype;
begin
  if exists (select 1 from scheduled_days
             where user_id = demo and date = current_date and session_type = 'strength') then
    return;
  end if;

  select max(date) into src
  from scheduled_days
  where user_id = demo and session_type = 'strength' and date < current_date;

  if src is null then return; end if;

  select * into a from scheduled_days where user_id = demo and date = current_date;
  select * into b from scheduled_days where user_id = demo and date = src;

  update scheduled_days set
    session_type = b.session_type, focus = b.focus, description = b.description,
    is_key = b.is_key, is_rest = b.is_rest, garmin_workout_id = b.garmin_workout_id
  where user_id = demo and date = current_date;

  update scheduled_days set
    session_type = a.session_type, focus = a.focus, description = a.description,
    is_key = a.is_key, is_rest = a.is_rest, garmin_workout_id = a.garmin_workout_id
  where user_id = demo and date = src;

  update strength_sessions set
    date = current_date,
    garmin_workout_id = 812000000 + (('x'||substr(md5(current_date::text),1,6))::bit(24)::int)
  where user_id = demo and date = src;
end $$;

-- ── 10. A finished background job, so the jobs log isn't empty ─────────────
insert into replan_jobs (user_id, type, status, created_at, started_at, completed_at, coach_feedback)
values
  ('00000000-0000-4000-8000-000000000001', 'replan', 'done',
   now() - interval '2 days', now() - interval '2 days' + interval '4 seconds',
   now() - interval '2 days' + interval '3 minutes',
   'Plan regenerated. Leg volume moved off Thursday to keep 24 h clear of the interval session.'),
  ('00000000-0000-4000-8000-000000000001', 'sync_kpis', 'done',
   now() - interval '3 hours', now() - interval '3 hours',
   now() - interval '3 hours' + interval '18 seconds',
   'KPIs synced — 1 new activity, 1 day of metrics.');

commit;

-- Verify
select 'daily_metrics' as t, count(*) from daily_metrics where user_id = '00000000-0000-4000-8000-000000000001'
union all select 'scheduled_days', count(*) from scheduled_days where user_id = '00000000-0000-4000-8000-000000000001'
union all select 'exercises', count(*) from exercises where user_id = '00000000-0000-4000-8000-000000000001'
union all select 'completed_activities', count(*) from completed_activities where user_id = '00000000-0000-4000-8000-000000000001'
union all select 'nutrition_diary', count(*) from nutrition_diary where user_id = '00000000-0000-4000-8000-000000000001';
