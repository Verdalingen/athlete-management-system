import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO } from "@/lib/dates";
import { NutritionClient } from "./NutritionClient";

export default async function NutritionPage() {
  // Always opens on today — a previously-viewed date is in-session client state
  // (see navigateDate in NutritionClient), never part of the URL.
  const date = todayISO();

  const sb = createServerClient();
  const uid = await getUserId();

  const [diaryRes, targetsRes, dayRes, dailyTargetRes, nudgeRes, mealRecsRes] = await Promise.all([
    sb.from("nutrition_diary").select("*").eq("user_id", uid).eq("date", date).order("created_at"),
    sb.from("nutrition_targets").select("*").eq("user_id", uid),
    sb.from("scheduled_days").select("session_type,is_rest,is_key,focus,description").eq("user_id", uid).eq("date", date).limit(1),
    sb.from("nutrition_daily_targets").select("*").eq("user_id", uid).eq("date", date).limit(1),
    sb.from("nutrition_nudges").select("message,tomorrow_session,created_at").eq("user_id", uid).eq("date", date).maybeSingle(),
    sb.from("nutrition_meal_recommendations").select("*").eq("user_id", uid).eq("date", date),
  ]);

  const entries = diaryRes.data ?? [];
  const targets = targetsRes.data ?? [];
  const scheduledDay = dayRes.data?.[0] ?? null;
  const dailyTarget = dailyTargetRes.data?.[0] ?? null;
  const nudge = nudgeRes.data ?? null;
  const mealRecommendations = mealRecsRes.data ?? [];

  // Determine today's day type from the scheduled session
  let dayType: string = "default";
  if (scheduledDay) {
    if (scheduledDay.is_rest) dayType = "rest";
    else if (scheduledDay.is_key) dayType = "hard";
    else dayType = "easy";
  }

  // Day-type template as fallback
  const templateTarget =
    targets.find((t) => t.day_type === dayType) ??
    targets.find((t) => t.day_type === "default") ??
    null;

  // Pipeline-generated daily target takes priority over static template
  const target = dailyTarget ?? templateTarget;

  return (
    <NutritionClient
      initialDate={date}
      initialEntries={entries}
      target={target}
      dayType={dayType}
      dailyTarget={dailyTarget}
      nudge={nudge}
      mealRecommendations={mealRecommendations}
    />
  );
}
