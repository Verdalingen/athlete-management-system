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

export async function GET() {
  try {
    const uid = await getUserId();
    const sb = createServerClient();

    const { data: templates, error } = await sb
      .from("meal_templates")
      .select("*, meal_template_items(*)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;
    // Sort items within each template
    const sorted = (templates ?? []).map(t => ({
      ...t,
      meal_template_items: (t.meal_template_items ?? []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order,
      ),
    }));
    return NextResponse.json({ meals: sorted });
  } catch (err) {
    return NextResponse.json(serializeError(err), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId();
    const { name, description, category, servings, prep_minutes, source, source_url, items } = await req.json() as {
      name: string;
      description?: string | null;
      category?: string;
      servings: number;
      prep_minutes?: number | null;
      source?: string | null;
      source_url?: string | null;
      items: Array<{
        food_name: string; quantity_g: number;
        serving_qty?: number | null; serving_label?: string | null;
        calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
        usda_fdc_id?: number | null; custom_food_id?: string | null;
      }>;
    };

    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!items?.length) return NextResponse.json({ error: "at least one item required" }, { status: 400 });

    const sb = createServerClient();

    const { data: template, error: tErr } = await sb
      .from("meal_templates")
      .insert({
        user_id: uid,
        name: name.trim(),
        description: description?.trim() ?? null,
        category: category ?? "Other",
        servings: servings ?? 1,
        prep_minutes: prep_minutes ?? null,
        source: source ?? "manual",
        source_url: source_url ?? null,
      })
      .select()
      .single();

    if (tErr) throw tErr;

    const rows = items.map((item, i) => ({
      template_id: template.id,
      food_name: item.food_name,
      quantity_g: item.quantity_g,
      serving_qty: item.serving_qty ?? null,
      serving_label: item.serving_label ?? null,
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
      usda_fdc_id: item.usda_fdc_id ?? null,
      custom_food_id: item.custom_food_id ?? null,
      sort_order: i,
    }));

    const { data: insertedItems, error: iErr } = await sb
      .from("meal_template_items")
      .insert(rows)
      .select();

    if (iErr) throw iErr;

    return NextResponse.json({ meal: { ...template, meal_template_items: insertedItems } });
  } catch (err) {
    return NextResponse.json(serializeError(err), { status: 500 });
  }
}
