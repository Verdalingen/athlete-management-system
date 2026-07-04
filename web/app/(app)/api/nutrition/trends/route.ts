import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const uid = await getUserId();
    const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "7"), 90);

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceStr = since.toISOString().split("T")[0];

    const sb = createServerClient();

    const [{ data, error }, dailyTargetsRes, scheduledRes, templatesRes] = await Promise.all([
      sb
        .from("nutrition_diary")
        .select("date, calories, protein_g, carbs_g, fat_g, fiber_g")
        .eq("user_id", uid)
        .neq("meal_type", "water")
        .gte("date", sinceStr)
        .order("date", { ascending: true }),
      sb.from("nutrition_daily_targets").select("date,calories,protein_g").eq("user_id", uid).gte("date", sinceStr),
      sb.from("scheduled_days").select("date,is_rest,is_key").eq("user_id", uid).gte("date", sinceStr),
      sb.from("nutrition_targets").select("day_type,calories,protein_g").eq("user_id", uid),
    ]);

    if (error) throw error;

    // Aggregate per day in JS (Supabase JS has no GROUP BY sugar)
    const agg = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }>();
    for (const row of data ?? []) {
      const existing = agg.get(row.date);
      if (existing) {
        existing.calories  += row.calories  ?? 0;
        existing.protein_g += row.protein_g ?? 0;
        existing.carbs_g   += row.carbs_g   ?? 0;
        existing.fat_g     += row.fat_g     ?? 0;
        existing.fiber_g   += row.fiber_g   ?? 0;
      } else {
        agg.set(row.date, {
          calories:  row.calories  ?? 0,
          protein_g: row.protein_g ?? 0,
          carbs_g:   row.carbs_g   ?? 0,
          fat_g:     row.fat_g     ?? 0,
          fiber_g:   row.fiber_g   ?? 0,
        });
      }
    }

    // Resolve each date's OWN target the same way /api/nutrition/daily-target does —
    // a specific nutrition_daily_targets row for that date if present, else the
    // day-type template (hard/easy/rest/default) matched via that date's scheduled_days row.
    // Without this, every day in the strip would be compared against whichever day is
    // currently selected in the parent, which is misleading for hard/easy/rest days that
    // legitimately have different calorie/protein targets.
    const dailyTargets = new Map((dailyTargetsRes.data ?? []).map(t => [t.date as string, t]));
    const scheduledDays = new Map((scheduledRes.data ?? []).map(d => [d.date as string, d]));
    const templates = templatesRes.data ?? [];

    function resolveTarget(date: string) {
      const daily = dailyTargets.get(date);
      if (daily) return { target_calories: daily.calories ?? null, target_protein_g: daily.protein_g ?? null };
      const scheduledDay = scheduledDays.get(date);
      let dayType = "default";
      if (scheduledDay) {
        if (scheduledDay.is_rest) dayType = "rest";
        else if (scheduledDay.is_key) dayType = "hard";
        else dayType = "easy";
      }
      const template = templates.find(t => t.day_type === dayType) ?? templates.find(t => t.day_type === "default") ?? null;
      return { target_calories: template?.calories ?? null, target_protein_g: template?.protein_g ?? null };
    }

    const result = Array.from(agg.entries()).map(([date, totals]) => ({ date, ...totals, ...resolveTarget(date) }));
    return NextResponse.json({ days: result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
