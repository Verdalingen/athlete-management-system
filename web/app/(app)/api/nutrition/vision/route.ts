import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const USDA_KEY = process.env.USDA_FDC_API_KEY ?? "DEMO_KEY";

// ── USDA nutrient ID map ──────────────────────────────────────────────────────

const NID = {
  calories: 1008, protein: 1003, fat: 1004, carbs: 1005, fiber: 1079,
  sugar: 2000, sodium: 1093, calcium: 1087, iron: 1089, magnesium: 1090,
  phosphorus: 1091, potassium: 1092, zinc: 1095, copper: 1098,
  vitamin_a: 1106, vitamin_c: 1162, vitamin_d: 1114, vitamin_e: 1109,
  vitamin_k: 1185, thiamin: 1165, riboflavin: 1166, niacin: 1167,
  vitamin_b6: 1175, folate: 1177, vitamin_b12: 1178,
  saturated_fat: 1258, monounsaturated_fat: 1292, polyunsaturated_fat: 1293,
  omega3: 1404, cholesterol: 1253,
} as const;

type NMap = Record<number, number>;

function extractNutrients(foodNutrients: Array<{ nutrientId: number; value: number }>): NMap {
  const m: NMap = {};
  for (const n of foodNutrients) m[n.nutrientId] = n.value;
  return m;
}

function r(m: NMap, id: number) { return Math.round((m[id] ?? 0) * 10) / 10; }

type Per100g = {
  calories: number; protein: number; carbs: number; fat: number; fiber: number;
  sugar: number; sodium: number; calcium: number; iron: number; magnesium: number;
  phosphorus: number; potassium: number; zinc: number; copper: number;
  vitamin_a: number; vitamin_c: number; vitamin_d: number; vitamin_e: number; vitamin_k: number;
  thiamin: number; riboflavin: number; niacin: number; vitamin_b6: number;
  folate: number; vitamin_b12: number;
  saturated_fat: number; monounsaturated_fat: number; polyunsaturated_fat: number;
  omega3: number; cholesterol: number;
};

// Lookup a food in USDA FoodData Central. Prefers Foundation/SR Legacy (whole foods, per-100g).
async function usdaLookup(query: string): Promise<{ fdcId: number; description: string; per100g: Per100g } | null> {
  try {
    const url = new URL(`${USDA_BASE}/foods/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("api_key", USDA_KEY);
    url.searchParams.set("pageSize", "3");
    url.searchParams.set("dataType", "Foundation,SR Legacy");

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const json = await res.json();
    const food = (json.foods ?? [])[0];
    if (!food) return null;

    const nm = extractNutrients(food.foodNutrients ?? []);

    return {
      fdcId: food.fdcId,
      description: food.description,
      per100g: {
        calories: r(nm, NID.calories), protein: r(nm, NID.protein), carbs: r(nm, NID.carbs),
        fat: r(nm, NID.fat), fiber: r(nm, NID.fiber), sugar: r(nm, NID.sugar),
        sodium: r(nm, NID.sodium), calcium: r(nm, NID.calcium), iron: r(nm, NID.iron),
        magnesium: r(nm, NID.magnesium), phosphorus: r(nm, NID.phosphorus),
        potassium: r(nm, NID.potassium), zinc: r(nm, NID.zinc), copper: r(nm, NID.copper),
        vitamin_a: r(nm, NID.vitamin_a), vitamin_c: r(nm, NID.vitamin_c),
        vitamin_d: r(nm, NID.vitamin_d), vitamin_e: r(nm, NID.vitamin_e),
        vitamin_k: r(nm, NID.vitamin_k), thiamin: r(nm, NID.thiamin),
        riboflavin: r(nm, NID.riboflavin), niacin: r(nm, NID.niacin),
        vitamin_b6: r(nm, NID.vitamin_b6), folate: r(nm, NID.folate),
        vitamin_b12: r(nm, NID.vitamin_b12), saturated_fat: r(nm, NID.saturated_fat),
        monounsaturated_fat: r(nm, NID.monounsaturated_fat), polyunsaturated_fat: r(nm, NID.polyunsaturated_fat),
        omega3: r(nm, NID.omega3), cholesterol: r(nm, NID.cholesterol),
      },
    };
  } catch {
    return null;
  }
}

// ── Claude vision prompt ──────────────────────────────────────────────────────

const VISION_PROMPT = `You are a nutrition expert analyzing a food photo for an athlete's food diary.

Identify every distinct food item visible. For each item:
1. Name it specifically (e.g. "Grilled chicken breast", "Brown rice", "Steamed broccoli")
2. Provide a simplified USDA search term — drop cooking method, brand, and adjectives (e.g. "chicken breast", "brown rice", "broccoli")
3. Estimate portion weight in grams using visual cues: plate diameter (~26cm standard), utensils for scale, food density, typical serving norms
4. Estimate macros as a fallback (used only when the food cannot be found in a verified database)

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "items": [
    {
      "food_name": "string",
      "usda_query": "string",
      "quantity_g": number,
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "fiber_g": number,
      "confidence": "high" | "medium" | "low",
      "note": "string or null"
    }
  ],
  "meal_description": "string",
  "total_calories": number
}

Rules:
- Be conservative on portions when uncertain — athletes prefer accuracy over overestimation
- List each component separately if distinguishable (e.g. separate rice, chicken, vegetables in a bowl)
- confidence: "high" = clearly identifiable with obvious portion cues; "medium" = reasonable estimate; "low" = guessing
- usda_query: simple generic term for USDA FoodData Central (whole-food names work best)
- If not a food image, return: { "items": [], "meal_description": "", "total_calories": 0, "error": "Not a food image" }
- Never include calorie counts in the note field`;

// ── Request handler ───────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image") as File | null;

    if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    // ── Phase 1: Claude identifies foods and estimates portions ───────────
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: VISION_PROMPT },
        ],
      }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: {
      items: Array<{
        food_name: string;
        usda_query?: string;
        quantity_g: number;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
        fiber_g?: number;
        confidence: string;
        note?: string | null;
      }>;
      meal_description: string;
      total_calories: number;
      error?: string;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 502 });
    }

    if (parsed.error) {
      return NextResponse.json({ error: parsed.error, items: [] });
    }

    // ── Phase 2: USDA lookup to replace AI macro estimates ────────────────
    // Run all lookups in parallel; fall back to Claude estimates on miss.
    const enrichedItems = await Promise.all(
      (parsed.items ?? []).map(async (item) => {
        const usda = await usdaLookup(item.usda_query ?? item.food_name);

        if (usda) {
          const scale = item.quantity_g / 100;
          const p = usda.per100g;
          return {
            food_name:        item.food_name,
            quantity_g:       item.quantity_g,
            calories:         Math.round(p.calories  * scale),
            protein_g:        Math.round(p.protein   * scale * 10) / 10,
            carbs_g:          Math.round(p.carbs     * scale * 10) / 10,
            fat_g:            Math.round(p.fat       * scale * 10) / 10,
            fiber_g:          Math.round(p.fiber     * scale * 10) / 10,
            confidence:       item.confidence,
            note:             item.note ?? null,
            source:           "usda" as const,
            usda_fdc_id:      usda.fdcId,
            usda_description: usda.description,
            per_100g: {
              calories:  p.calories,  protein_g: p.protein,
              carbs_g:   p.carbs,     fat_g:     p.fat,     fiber_g: p.fiber,
            },
          };
        }

        return {
          food_name:  item.food_name,
          quantity_g: item.quantity_g,
          calories:   item.calories,
          protein_g:  item.protein_g,
          carbs_g:    item.carbs_g,
          fat_g:      item.fat_g,
          fiber_g:    item.fiber_g ?? 0,
          confidence: item.confidence,
          note:       item.note ?? null,
          source:     "ai_estimate" as const,
        };
      }),
    );

    const total_calories = enrichedItems.reduce((sum, i) => sum + i.calories, 0);

    return NextResponse.json({
      items: enrichedItems,
      meal_description: parsed.meal_description ?? "",
      total_calories,
    });
  } catch (err) {
    console.error("[vision]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
