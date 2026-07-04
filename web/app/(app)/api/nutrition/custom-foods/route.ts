import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function GET() {
  try {
    const uid = await getUserId();
    const sb = createServerClient();
    const { data, error } = await sb
      .from("custom_foods")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ foods: data ?? [] });
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
      .from("custom_foods")
      .insert({ ...body, user_id: uid })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ food: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
