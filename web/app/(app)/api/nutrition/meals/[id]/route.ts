import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const uid = await getUserId();
    const { id } = await params;
    const { name, description, category, servings } = await req.json() as {
      name?: string; description?: string; category?: string; servings?: number;
    };
    const sb = createServerClient();
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name.trim();
    if (description !== undefined) update.description = description?.trim() ?? null;
    if (category !== undefined) update.category = category;
    if (servings !== undefined) update.servings = servings;
    const { data, error } = await sb
      .from("meal_templates")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select("*, meal_template_items(*)")
      .single();
    if (error) throw error;
    return NextResponse.json({ meal: data });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 });
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
    // Items cascade-delete via FK
    const { error } = await sb
      .from("meal_templates")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
