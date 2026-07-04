import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const uid = await getUserId();
    const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "14"), 90);

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceStr = since.toISOString().split("T")[0];

    const sb = createServerClient();
    const { data, error } = await sb
      .from("body_weight_log")
      .select("id, date, weight_kg, source, notes")
      .eq("user_id", uid)
      .gte("date", sinceStr)
      .order("date", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ entries: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId();
    const { date, weight_kg, notes } = await req.json() as {
      date: string;
      weight_kg: number;
      notes?: string;
    };

    if (!date || !weight_kg) {
      return NextResponse.json({ error: "date and weight_kg required" }, { status: 400 });
    }

    const sb = createServerClient();
    const { data, error } = await sb
      .from("body_weight_log")
      .upsert(
        { user_id: uid, date, weight_kg, notes: notes ?? null, source: "manual" },
        { onConflict: "user_id,date" },
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ entry: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = await getUserId();
    const date = req.nextUrl.searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const sb = createServerClient();
    const { error } = await sb
      .from("body_weight_log")
      .delete()
      .eq("user_id", uid)
      .eq("date", date);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
