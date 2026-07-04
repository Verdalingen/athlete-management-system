import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const uid = await getUserId();
    const { id } = await params;
    const sb = createServerClient();
    const { error } = await sb
      .from("nutrition_diary")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
