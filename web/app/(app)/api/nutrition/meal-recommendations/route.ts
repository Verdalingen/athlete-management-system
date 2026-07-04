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
    const start = req.nextUrl.searchParams.get("start");
    const end = req.nextUrl.searchParams.get("end");
    if (!date && !(start && end)) {
      return NextResponse.json({ error: "date, or start+end, required" }, { status: 400 });
    }

    const sb = createServerClient();
    let query = sb.from("nutrition_meal_recommendations").select("*").eq("user_id", uid);
    query = date ? query.eq("date", date) : query.gte("date", start!).lte("date", end!);
    const { data, error } = await query.order("date");

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return NextResponse.json(serializeError(err), { status: 500 });
  }
}
