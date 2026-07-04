import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const uid = await getUserId();
    const date = req.nextUrl.searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const sb = createServerClient();

    const [dailyRes, dayRes, targetsRes] = await Promise.all([
      sb.from("nutrition_daily_targets").select("*").eq("user_id", uid).eq("date", date).maybeSingle(),
      sb.from("scheduled_days").select("is_rest,is_key").eq("user_id", uid).eq("date", date).maybeSingle(),
      sb.from("nutrition_targets").select("*").eq("user_id", uid),
    ]);

    const dailyTarget = dailyRes.data ?? null;
    const scheduledDay = dayRes.data ?? null;
    const targets = targetsRes.data ?? [];

    let dayType = "default";
    if (scheduledDay) {
      if (scheduledDay.is_rest) dayType = "rest";
      else if (scheduledDay.is_key) dayType = "hard";
      else dayType = "easy";
    }

    const templateTarget =
      targets.find(t => t.day_type === dayType) ??
      targets.find(t => t.day_type === "default") ??
      null;

    return NextResponse.json({
      dailyTarget,
      dayType,
      target: dailyTarget ?? templateTarget,
    });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 });
  }
}
