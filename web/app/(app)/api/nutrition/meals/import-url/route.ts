import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getUserId } from "@/lib/supabase-server";
import { getAuthenticatedLanguage } from "@/lib/i18n/getServerLanguage";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { languagePromptInstruction } from "@/lib/i18n/language";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type JsonLdNode = Record<string, unknown>;

function findRecipe(node: unknown): JsonLdNode | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const obj = node as JsonLdNode;
    if (obj["@graph"]) {
      const found = findRecipe(obj["@graph"]);
      if (found) return found;
    }
    const t = obj["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return obj;
  }
  return null;
}

function extractRecipeJsonLd(html: string): JsonLdNode | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const recipe = findRecipe(parsed);
      if (recipe) return recipe;
    } catch {
      // malformed JSON-LD block — skip it, try the next
    }
  }
  return null;
}

function parseIsoDurationMinutes(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const m = iso.match(/P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const hours = parseInt(m[1] ?? "0", 10);
  const mins = parseInt(m[2] ?? "0", 10);
  const total = hours * 60 + mins;
  return total > 0 ? total : null;
}

function parseYield(y: unknown): number {
  const str = Array.isArray(y) ? String(y[0] ?? "") : String(y ?? "");
  const m = str.match(/\d+/);
  return m ? parseInt(m[0], 10) : 1;
}

function flattenInstructions(instr: unknown): string[] {
  if (!instr) return [];
  if (typeof instr === "string") {
    return instr.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(instr)) {
    const out: string[] = [];
    for (const step of instr) {
      if (typeof step === "string") { out.push(step.trim()); continue; }
      if (step && typeof step === "object") {
        const s = step as JsonLdNode;
        if (s["@type"] === "HowToSection" && Array.isArray(s.itemListElement)) {
          out.push(...flattenInstructions(s.itemListElement));
          continue;
        }
        if (typeof s.text === "string") { out.push(s.text.trim()); continue; }
      }
    }
    return out.filter(Boolean);
  }
  return [];
}

function serializeError(err: unknown) {
  const e = err as { message?: string };
  return { error: e?.message ?? String(err) };
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId();
    const language = await getAuthenticatedLanguage(uid);
    const t = dictionaries[language].nutrition.api.importUrl;

    const { url } = await req.json().catch(() => ({})) as { url?: string };
    if (!url?.trim()) return NextResponse.json({ error: "url required" }, { status: 400 });

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("bad protocol");
    } catch {
      return NextResponse.json({ error: t.invalidUrl }, { status: 400 });
    }

    let html: string;
    try {
      const res = await fetch(parsedUrl.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GarminAICoach/1.0; +recipe-import)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch {
      return NextResponse.json({ error: t.fetchFailed }, { status: 400 });
    }

    const recipe = extractRecipeJsonLd(html);
    if (!recipe) {
      return NextResponse.json({ error: t.noRecipeData }, { status: 400 });
    }

    const name = typeof recipe.name === "string" ? recipe.name : "Imported recipe";
    const servings = parseYield(recipe.recipeYield);
    const prepMin = parseIsoDurationMinutes(recipe.prepTime) ?? 0;
    const cookMin = parseIsoDurationMinutes(recipe.cookTime) ?? 0;
    const totalMin = parseIsoDurationMinutes(recipe.totalTime);
    const prep_minutes = totalMin ?? ((prepMin + cookMin) || null);
    const rawIngredients = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient.filter((i): i is string => typeof i === "string")
      : [];
    const rawSteps = flattenInstructions(recipe.recipeInstructions);

    if (!rawIngredients.length) {
      return NextResponse.json({ error: t.noIngredients }, { status: 400 });
    }

    const systemPrompt = `You are a nutrition data assistant. Given a raw recipe's ingredient list and method, you (1) estimate structured macros per ingredient, and (2) rewrite the method as concise numbered steps in your own words — never copy the source sentences verbatim. Respond with valid JSON only, no markdown.${languagePromptInstruction(language)}`;

    const userPrompt = `## Raw ingredients
${rawIngredients.map(i => `- ${i}`).join("\n")}

## Raw method
${rawSteps.length ? rawSteps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(not provided)"}

## Task
For each ingredient, estimate: food_name (cleaned up, e.g. "2 tbsp olive oil" -> "Olive oil"), quantity_g (best-effort gram estimate from the stated amount — always fill this in, it's the sole basis for macro scaling), and serving_qty + serving_label whenever the source states a natural unit at all — discrete (e.g. "2 eggs" -> serving_qty 2, serving_label "egg") or volumetric (e.g. "1 cup flour" -> serving_qty 1, serving_label "cup"; "2 tbsp olive oil" -> serving_qty 2, serving_label "tbsp"; "1 tsp salt" -> serving_qty 1, serving_label "tsp"). Keep the unit exactly as the source phrased it (cup/tbsp/tsp, not converted to grams for display) — only omit serving_qty/serving_label when the source itself gives a plain weight or volume with no named unit (e.g. "200g", "500ml"). Also estimate calories, protein_g, carbs_g, fat_g, fiber_g for that quantity.

Also rewrite the method as clear, concise numbered steps in your own words (do not copy sentences verbatim from the raw method) — 3-8 steps is typical. Keep any stated oven temperatures and their original unit (°F or °C) exactly as given — do not convert them.

Respond ONLY with this JSON structure:
{
  "ingredients": [
    { "food_name": "Chicken breast", "quantity_g": 200, "calories": 330, "protein_g": 62, "carbs_g": 0, "fat_g": 7, "fiber_g": 0 },
    { "food_name": "Flour", "quantity_g": 120, "serving_qty": 1, "serving_label": "cup", "calories": 440, "protein_g": 12, "carbs_g": 92, "fat_g": 1, "fiber_g": 3 }
  ],
  "instructions": "1. Step one.\\n2. Step two."
}`;

    const stream = claude.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const response = await stream.finalMessage();
    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    type NormalizedIngredient = {
      food_name: string; quantity_g: number;
      serving_qty?: number; serving_label?: string;
      calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number;
    };
    let normalized: { ingredients: NormalizedIngredient[]; instructions: string };
    try {
      normalized = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      return NextResponse.json({ error: t.parseFailed }, { status: 500 });
    }

    const draft = {
      name,
      servings,
      prep_minutes,
      description: normalized.instructions?.trim() || rawSteps.join("\n") || null,
      source: "imported_url" as const,
      source_url: parsedUrl.toString(),
      ingredients: (normalized.ingredients ?? []).map(ing => ({
        food_name: ing.food_name,
        quantity_g: ing.quantity_g,
        serving_qty: ing.serving_qty ?? null,
        serving_label: ing.serving_label ?? null,
        calories: Math.round(ing.calories),
        protein_g: ing.protein_g,
        carbs_g: ing.carbs_g,
        fat_g: ing.fat_g,
        fiber_g: ing.fiber_g ?? 0,
        usda_fdc_id: null,
        custom_food_id: null,
      })),
    };

    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(serializeError(err), { status: 500 });
  }
}
