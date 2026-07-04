import { NextRequest, NextResponse } from "next/server";
import { extractPortions } from "../_lib/usda";

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const API_KEY = process.env.USDA_FDC_API_KEY ?? "DEMO_KEY";

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

type NutrientMap = Record<number, number>;

function extractNutrients(foodNutrients: Array<{ nutrientId?: number; value?: number; nutrient?: { id: number }; amount?: number }>): NutrientMap {
  const map: NutrientMap = {};
  for (const n of foodNutrients) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const val = n.value ?? n.amount;
    if (id !== undefined && val !== undefined) map[id] = val;
  }
  return map;
}

function normaliseTo100g(map: NutrientMap, servingG: number | null): NutrientMap {
  if (!servingG || servingG === 100) return map;
  const factor = 100 / servingG;
  const out: NutrientMap = {};
  for (const [k, v] of Object.entries(map)) out[Number(k)] = v * factor;
  return out;
}

function r(map: NutrientMap, id: number) { return Math.round((map[id] ?? 0) * 10) / 10; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatFood(raw: Record<string, any>) {
  const servingG = raw.servingSizeUnit?.toLowerCase() === "g" ? raw.servingSize : null;
  const isBranded = raw.dataType === "Branded";
  const rawN = extractNutrients(raw.foodNutrients ?? []);
  const n = isBranded ? normaliseTo100g(rawN, servingG) : rawN;
  return {
    fdcId:                   raw.fdcId,
    portions:                extractPortions(raw),
    calories:                r(n, NID.calories),
    protein:                 r(n, NID.protein),
    carbs:                   r(n, NID.carbs),
    fat:                     r(n, NID.fat),
    fiber:                   r(n, NID.fiber),
    sugar:                   r(n, NID.sugar),
    sodium:                  r(n, NID.sodium),
    vitamin_a_mcg:           r(n, NID.vitamin_a),
    vitamin_c_mg:            r(n, NID.vitamin_c),
    vitamin_d_mcg:           r(n, NID.vitamin_d),
    vitamin_e_mg:            r(n, NID.vitamin_e),
    vitamin_k_mcg:           r(n, NID.vitamin_k),
    thiamin_mg:              r(n, NID.thiamin),
    riboflavin_mg:           r(n, NID.riboflavin),
    niacin_mg:               r(n, NID.niacin),
    vitamin_b6_mg:           r(n, NID.vitamin_b6),
    folate_mcg:              r(n, NID.folate),
    vitamin_b12_mcg:         r(n, NID.vitamin_b12),
    calcium_mg:              r(n, NID.calcium),
    iron_mg:                 r(n, NID.iron),
    magnesium_mg:            r(n, NID.magnesium),
    phosphorus_mg:           r(n, NID.phosphorus),
    potassium_mg:            r(n, NID.potassium),
    zinc_mg:                 r(n, NID.zinc),
    copper_mg:               r(n, NID.copper),
    saturated_fat_g:         r(n, NID.saturated_fat),
    monounsaturated_fat_g:   r(n, NID.monounsaturated_fat),
    polyunsaturated_fat_g:   r(n, NID.polyunsaturated_fat),
    omega3_g:                r(n, NID.omega3),
    cholesterol_mg:          r(n, NID.cholesterol),
  };
}

// GET /api/nutrition/food-details?ids=123,456
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw.split(",").map(Number).filter(Boolean);
  if (!ids.length) return NextResponse.json({ foods: [] });

  const url = new URL(`${USDA_BASE}/foods`);
  url.searchParams.set("api_key", API_KEY);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fdcIds: ids, format: "full" }),
    next: { revalidate: 86400 },
  });

  if (!res.ok) return NextResponse.json({ foods: [] }, { status: 502 });

  const data = await res.json();
  const foods = (Array.isArray(data) ? data : []).map(formatFood);
  return NextResponse.json({ foods });
}
