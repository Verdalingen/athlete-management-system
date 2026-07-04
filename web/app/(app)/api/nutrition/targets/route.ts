import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function GET() {
  try {
    const uid = await getUserId();
    const sb = createServerClient();
    const { data, error } = await sb
      .from("nutrition_targets")
      .select("*")
      .eq("user_id", uid)
      .order("day_type");

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId();
    const body = await req.json();
    const sb = createServerClient();
    const { data, error } = await sb
      .from("nutrition_targets")
      .upsert(
        { ...body, user_id: uid, updated_at: new Date().toISOString() },
        { onConflict: "user_id,day_type" },
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
