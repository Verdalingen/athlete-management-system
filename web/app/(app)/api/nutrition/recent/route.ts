import { NextResponse } from "next/server";
import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function GET() {
  try {
    const uid = await getUserId();
    const sb = createServerClient();

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split("T")[0];

    const { data, error } = await sb
      .from("nutrition_diary")
      .select("food_name, quantity_g, serving_qty, serving_label, calories, protein_g, carbs_g, fat_g, fiber_g, usda_fdc_id, date")
      .eq("user_id", uid)
      .neq("meal_type", "water")
      .gte("date", sinceStr)
      .order("date", { ascending: false });

    if (error) throw error;

    // Deduplicate by food_name (case-insensitive). Data is already sorted newest-first,
    // so first occurrence of each key is the most recent entry — we keep its macros/qty.
    const seen = new Map<string, { entry: (typeof data)[0]; count: number }>();
    for (const row of data ?? []) {
      const key = row.food_name.toLowerCase().trim();
      const existing = seen.get(key);
      if (existing) {
        existing.count++;
      } else {
        seen.set(key, { entry: row, count: 1 });
      }
    }

    const foods = Array.from(seen.values())
      .sort((a, b) => {
        if (b.entry.date !== a.entry.date) return b.entry.date.localeCompare(a.entry.date);
        return b.count - a.count;
      })
      .slice(0, 20)
      .map(({ entry, count }) => ({ ...entry, use_count: count }));

    return NextResponse.json({ foods });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
