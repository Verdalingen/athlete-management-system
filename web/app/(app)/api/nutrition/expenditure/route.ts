import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const uid = await getUserId();
    const date = req.nextUrl.searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const sb = createServerClient();

    const { data, error } = await sb
      .from("daily_metrics")
      .select("total_calories, active_calories, bmr_calories")
      .eq("user_id", uid)
      .eq("date", date)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      total_calories: data?.total_calories ?? null,
      active_calories: data?.active_calories ?? null,
      bmr_calories: data?.bmr_calories ?? null,
    });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 });
  }
}
