-- Removes everything supabase/seed_demo.sql created, including the demo user.
-- Touches nothing outside the demo user's rows.

begin;

delete from completed_exercise_sets        where user_id = '00000000-0000-4000-8000-000000000001';
delete from exercises                      where user_id = '00000000-0000-4000-8000-000000000001';
delete from strength_sessions              where user_id = '00000000-0000-4000-8000-000000000001';
delete from scheduled_days                 where user_id = '00000000-0000-4000-8000-000000000001';
delete from plans                          where user_id = '00000000-0000-4000-8000-000000000001';
delete from daily_metrics                  where user_id = '00000000-0000-4000-8000-000000000001';
delete from completed_activities           where user_id = '00000000-0000-4000-8000-000000000001';
delete from analyses                       where user_id = '00000000-0000-4000-8000-000000000001';
delete from weekly_reviews                 where user_id = '00000000-0000-4000-8000-000000000001';
delete from replan_jobs                    where user_id = '00000000-0000-4000-8000-000000000001';
delete from nutrition_diary                where user_id = '00000000-0000-4000-8000-000000000001';
delete from nutrition_daily_targets        where user_id = '00000000-0000-4000-8000-000000000001';
delete from nutrition_targets              where user_id = '00000000-0000-4000-8000-000000000001';
delete from nutrition_meal_recommendations where user_id = '00000000-0000-4000-8000-000000000001';
delete from body_weight_log                where user_id = '00000000-0000-4000-8000-000000000001';
delete from athlete_profile                where user_id = '00000000-0000-4000-8000-000000000001';
delete from user_settings                  where user_id = '00000000-0000-4000-8000-000000000001';
delete from auth.users                     where id      = '00000000-0000-4000-8000-000000000001';

commit;
