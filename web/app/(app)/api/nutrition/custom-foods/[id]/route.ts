import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const uid = await getUserId();
    const { id } = await params;
    const body = await req.json();
    const sb = createServerClient();
    const { data, error } = await sb
      .from("custom_foods")
      .update(body)
      .eq("id", id)
      .eq("user_id", uid)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ food: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const uid = await getUserId();
    const { id } = await params;
    const sb = createServerClient();
    const { error } = await sb
      .from("custom_foods")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
