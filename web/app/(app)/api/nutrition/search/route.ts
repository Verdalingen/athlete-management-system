import { NextRequest, NextResponse } from "next/server";

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const API_KEY = process.env.USDA_FDC_API_KEY ?? "DEMO_KEY";

// Nutrient IDs from USDA FoodData Central
const NID = {
  calories:            1008,
  protein:             1003,
  fat:                 1004,
  carbs:               1005,
  fiber:               1079,
  sugar:               2000,
  sodium:              1093,
  calcium:             1087,
  iron:                1089,
  magnesium:           1090,
  phosphorus:          1091,
  potassium:           1092,
  zinc:                1095,
  copper:              1098,
  vitamin_a:           1106,
  vitamin_c:           1162,
  vitamin_d:           1114,
  vitamin_e:           1109,
  vitamin_k:           1185,
  thiamin:             1165,
  riboflavin:          1166,
  niacin:              1167,
  vitamin_b6:          1175,
  folate:              1177,
  vitamin_b12:         1178,
  saturated_fat:       1258,
  monounsaturated_fat: 1292,
  polyunsaturated_fat: 1293,
  omega3:              1404,
  cholesterol:         1253,
} as const;

type NutrientMap = Record<number, number>;

function extractNutrients(foodNutrients: Array<{ nutrientId: number; value: number }>): NutrientMap {
  const map: NutrientMap = {};
  for (const n of foodNutrients) {
    map[n.nutrientId] = n.value;
  }
  return map;
}

// Normalise nutrients to per-100g basis.
// Branded foods may report per-serving; we scale back to per-100g.
function normaliseTo100g(map: NutrientMap, servingG: number | null): NutrientMap {
  if (!servingG || servingG === 100) return map;
  const factor = 100 / servingG;
  const out: NutrientMap = {};
  for (const [k, v] of Object.entries(map)) {
    out[Number(k)] = v * factor;
  }
  return out;
}

function get(map: NutrientMap, id: number): number {
  return Math.round((map[id] ?? 0) * 10) / 10;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatFood(raw: Record<string, any>) {
  const servingG =
    raw.servingSizeUnit?.toLowerCase() === "g" ? raw.servingSize : null;

  // Foundation / SR Legacy foods report nutrients per 100g already.
  // Branded foods report per serving — normalise.
  const isBranded = raw.dataType === "Branded";
  const rawNutrients = extractNutrients(raw.foodNutrients ?? []);
  const n = isBranded ? normaliseTo100g(rawNutrients, servingG) : rawNutrients;

  return {
    fdcId:       raw.fdcId,
    description: raw.description,
    brand:       raw.brandOwner ?? raw.brandName ?? null,
    category:    raw.foodCategory ?? null,
    dataType:    raw.dataType,
    servingSize: raw.servingSize ?? null,
    servingUnit: raw.servingSizeUnit ?? "g",
    servingLabel: raw.householdServingFullText ?? null,
    // per-100g macros
    calories:            get(n, NID.calories),
    protein:             get(n, NID.protein),
    carbs:               get(n, NID.carbs),
    fat:                 get(n, NID.fat),
    fiber:               get(n, NID.fiber),
    sugar:               get(n, NID.sugar),
    sodium:              get(n, NID.sodium),
    // vitamins
    vitamin_a_mcg:       get(n, NID.vitamin_a),
    vitamin_c_mg:        get(n, NID.vitamin_c),
    vitamin_d_mcg:       get(n, NID.vitamin_d),
    vitamin_e_mg:        get(n, NID.vitamin_e),
    vitamin_k_mcg:       get(n, NID.vitamin_k),
    thiamin_mg:          get(n, NID.thiamin),
    riboflavin_mg:       get(n, NID.riboflavin),
    niacin_mg:           get(n, NID.niacin),
    vitamin_b6_mg:       get(n, NID.vitamin_b6),
    folate_mcg:          get(n, NID.folate),
    vitamin_b12_mcg:     get(n, NID.vitamin_b12),
    // minerals
    calcium_mg:          get(n, NID.calcium),
    iron_mg:             get(n, NID.iron),
    magnesium_mg:        get(n, NID.magnesium),
    phosphorus_mg:       get(n, NID.phosphorus),
    potassium_mg:        get(n, NID.potassium),
    zinc_mg:             get(n, NID.zinc),
    copper_mg:           get(n, NID.copper),
    // fat detail
    saturated_fat_g:         get(n, NID.saturated_fat),
    monounsaturated_fat_g:   get(n, NID.monounsaturated_fat),
    polyunsaturated_fat_g:   get(n, NID.polyunsaturated_fat),
    omega3_g:                get(n, NID.omega3),
    cholesterol_mg:          get(n, NID.cholesterol),
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ foods: [] });
  }

  const url = new URL(`${USDA_BASE}/foods/search`);
  url.searchParams.set("query", q);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("pageSize", "25");
  url.searchParams.set("dataType", "Branded,SR Legacy,Foundation");

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return NextResponse.json({ foods: [], error: "USDA API error" }, { status: 502 });
  }

  const json = await res.json();
  const foods = (json.foods ?? []).map(formatFood);
  return NextResponse.json({ foods });
}
