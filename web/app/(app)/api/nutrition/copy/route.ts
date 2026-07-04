import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId();
    const { from_date, to_date } = await req.json() as { from_date: string; to_date: string };

    if (!from_date || !to_date) {
      return NextResponse.json({ error: "from_date and to_date required" }, { status: 400 });
    }
    if (from_date === to_date) {
      return NextResponse.json({ error: "Cannot copy a day to itself" }, { status: 400 });
    }

    const sb = createServerClient();

    // Fetch all food entries from the source date (exclude water — hydration varies daily)
    const { data: source, error: fetchErr } = await sb
      .from("nutrition_diary")
      .select("*")
      .eq("user_id", uid)
      .eq("date", from_date)
      .neq("meal_type", "water");

    if (fetchErr) throw fetchErr;
    if (!source?.length) return NextResponse.json({ copied: 0, entries: [] });

    // Insert as new rows on to_date (strip id + created_at so DB generates fresh ones)
    const newRows = source.map(({ id: _id, created_at: _ca, ...rest }) => ({
      ...rest,
      date: to_date,
      user_id: uid,
    }));

    const { data: inserted, error: insertErr } = await sb
      .from("nutrition_diary")
      .insert(newRows)
      .select();

    if (insertErr) throw insertErr;

    return NextResponse.json({ copied: inserted?.length ?? 0, entries: inserted ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
