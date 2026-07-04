import { NextRequest, NextResponse } from "next/server";

const OFF_BASE = "https://world.openfoodfacts.org/api/v0/product";
const OFF_FIELDS = "product_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url,categories_tags";

// Open Food Facts stores most nutrients in g/100g, but some vitamins in mg/100g.
// We normalise everything to the same units as USDA (mg where applicable).
function g2mg(v: number | undefined): number { return Math.round(((v ?? 0) * 1000) * 10) / 10; }
function r1(v: number | undefined): number { return Math.round((v ?? 0) * 10) / 10; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseProduct(barcode: string, p: Record<string, any>) {
  const n = p.nutriments ?? {};

  // Energy: prefer kcal field; fall back from kJ (÷ 4.184)
  const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0);

  // Parse a numeric serving size from strings like "30 g", "1 bar (28g)", "30"
  const rawServing: string = String(p.serving_size ?? p.serving_quantity ?? "");
  const servingMatch = rawServing.match(/(\d+(?:\.\d+)?)/);
  const servingSize = servingMatch ? parseFloat(servingMatch[1]) : null;

  return {
    source: "open_food_facts" as const,
    barcode,
    fdcId: 0,                               // sentinel — not a USDA food
    description: (p.product_name ?? "Unknown product").trim(),
    brand: p.brands ? p.brands.split(",")[0].trim() : null,
    category: p.categories_tags?.[0]?.replace(/^en:/, "") ?? null,
    imageUrl: p.image_front_small_url ?? null,
    servingSize,
    servingUnit: "g",
    servingLabel: servingSize ? `${servingSize}g` : null,

    // ── Macros (g/100g → keep as g) ──────────────────────────────────────
    calories:           Math.round(kcal * 10) / 10,
    protein:            r1(n.proteins_100g),
    carbs:              r1(n.carbohydrates_100g),
    fat:                r1(n.fat_100g),
    fiber:              r1(n.fiber_100g ?? n["fiber-insoluble_100g"]),
    sugar:              r1(n.sugars_100g),
    // Sodium: OFF stores g/100g → convert to mg/100g
    sodium:             g2mg(n.sodium_100g),

    // ── Vitamins ──────────────────────────────────────────────────────────
    // OFF stores vitamin C in mg/100g (consistent), others may vary
    vitamin_a_mcg:      r1(n["vitamin-a_100g"]),        // IU in some products
    vitamin_c_mg:       r1(n["vitamin-c_100g"]),         // mg/100g
    vitamin_d_mcg:      r1(n["vitamin-d_100g"]),
    vitamin_e_mg:       r1(n["vitamin-e_100g"]),
    vitamin_k_mcg:      r1(n["vitamin-k_100g"]),
    thiamin_mg:         r1(n.thiamin_100g ?? n["vitamin-b1_100g"]),
    riboflavin_mg:      r1(n.riboflavin_100g ?? n["vitamin-b2_100g"]),
    niacin_mg:          r1(n.niacin_100g ?? n["vitamin-pp_100g"]),
    vitamin_b6_mg:      r1(n["vitamin-b6_100g"]),
    folate_mcg:         r1(n.folate_100g ?? n["vitamin-b9_100g"]),
    vitamin_b12_mcg:    r1(n["vitamin-b12_100g"]),

    // ── Minerals (OFF: g/100g → convert to mg/100g) ───────────────────────
    calcium_mg:         g2mg(n.calcium_100g),
    iron_mg:            g2mg(n.iron_100g),
    magnesium_mg:       g2mg(n.magnesium_100g),
    phosphorus_mg:      g2mg(n.phosphorus_100g),
    potassium_mg:       g2mg(n.potassium_100g),
    zinc_mg:            g2mg(n.zinc_100g),
    copper_mg:          g2mg(n.copper_100g),

    // ── Fat breakdown ─────────────────────────────────────────────────────
    saturated_fat_g:        r1(n["saturated-fat_100g"]),
    monounsaturated_fat_g:  r1(n["monounsaturated-fat_100g"]),
    polyunsaturated_fat_g:  r1(n["polyunsaturated-fat_100g"]),
    omega3_g:               r1(n["omega-3-fat_100g"]),
    cholesterol_mg:         g2mg(n.cholesterol_100g),
  };
}

export async function GET(req: NextRequest) {
  const barcode = req.nextUrl.searchParams.get("code")?.trim();
  if (!barcode) return NextResponse.json({ error: "code required" }, { status: 400 });

  const url = `${OFF_BASE}/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "GarminAICoach/1.0 (contact@garminaicoach.com)" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return NextResponse.json({ found: false, error: "Open Food Facts unavailable" }, { status: 502 });
  }

  const json = await res.json();

  if (json.status === 0 || !json.product) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, food: normaliseProduct(barcode, json.product) });
}
