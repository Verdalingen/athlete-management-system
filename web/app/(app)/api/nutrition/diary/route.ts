import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

function serializeError(err: unknown) {
  const e = err as { message?: string; code?: string; hint?: string; details?: string };
  return {
    error:   e?.message   ?? String(err),
    code:    e?.code      ?? null,
    hint:    e?.hint      ?? null,
    details: e?.details   ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getUserId();
    const date = req.nextUrl.searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const sb = createServerClient();
    const { data, error } = await sb
      .from("nutrition_diary")
      .select("*")
      .eq("user_id", uid)
      .eq("date", date)
      .order("created_at");

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return NextResponse.json(serializeError(err), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId();
    const date = req.nextUrl.searchParams.get("date");
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const body = await req.json();
    const sb = createServerClient();
    const { data, error } = await sb
      .from("nutrition_diary")
      .insert({ ...body, user_id: uid, date })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(serializeError(err), { status: 500 });
  }
}
