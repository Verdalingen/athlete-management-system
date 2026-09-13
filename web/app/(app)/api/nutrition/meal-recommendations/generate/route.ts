import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient, getUserId } from "@/lib/supabase-server";
import { todayISO } from "@/lib/dates";
import { getAuthenticatedLanguage } from "@/lib/i18n/getServerLanguage";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { languagePromptInstruction } from "@/lib/i18n/language";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MEAL_TYPES = ["breakfast", "pre_workout", "lunch", "post_workout", "dinner", "snacks"] as const;
const MICRO_KEYS = ["vitamin_c_mg", "vitamin_d_mcg", "vitamin_a_mcg", "calcium_mg", "iron_mg", "magnesium_mg", "potassium_mg", "zinc_mg", "sodium_mg", "sugar_g"] as const;

function serializeError(err: unknown) {
  const e = err as { message?: string; code?: string; hint?: string; details?: string };
  return {
    error:   e?.message   ?? String(err),
    code:    e?.code      ?? null,
    hint:    e?.hint      ?? null,
    details: e?.details   ?? null,
  };
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId();
    const language = await getAuthenticatedLanguage(uid);
    const apiT = dictionaries[language].nutrition.api.mealPlan;
    const sb = createServerClient();
    const body = await req.json().catch(() => ({}));
    const startDate: string = body.date ?? todayISO();
    const days: number = Math.min(Math.max(body.days ?? 7, 1), 7);
    const endDate = addDays(startDate, days - 1);
    const dateRange = Array.from({ length: days }, (_, i) => addDays(startDate, i));

    // ── Gather context in parallel ────────────────────────────────────────
    const [memoryRes, dailyTargetsRes, targetsRes, scheduledRes, profileRes, recentRes] = await Promise.all([
      sb.rpc("get_athlete_memory", { p_user_id: uid }),
      sb.from("nutrition_daily_targets").select("*").eq("user_id", uid).gte("date", startDate).lte("date", endDate),
      sb.from("nutrition_targets").select("*").eq("user_id", uid),
      sb.from("scheduled_days").select("date,is_rest,is_key,focus,description").eq("user_id", uid).gte("date", startDate).lte("date", endDate),
      sb.from("athlete_profile").select("meal_variety_preference,country,grocery_stores_notes").eq("user_id", uid).maybeSingle(),
      sb.from("nutrition_diary")
        .select("date,meal_type,food_name")
        .eq("user_id", uid)
        .neq("meal_type", "water")
        .lt("date", startDate)
        .order("date", { ascending: false })
        .limit(30),
    ]);

    const variety = (profileRes.data?.meal_variety_preference as string) ?? "balanced";
    const country = (profileRes.data?.country as string) || "";
    const groceryStoresNotes = (profileRes.data?.grocery_stores_notes as string) || "";
    const locationText = country || groceryStoresNotes
      ? [country && `Country: ${country}`, groceryStoresNotes && `Store access: ${groceryStoresNotes}`].filter(Boolean).join(" | ")
      : "Not specified — assume standard Western grocery store availability.";
    const templatesRes = await sb
      .from("meal_templates")
      .select(
        variety === "minimal"
          ? "name,category,meal_template_items(food_name,quantity_g,serving_qty,serving_label,calories,protein_g,carbs_g,fat_g)"
          : "name,category,meal_template_items(calories,protein_g,carbs_g,fat_g)"
      )
      .eq("user_id", uid);

    const athleteMemory = (memoryRes.data as string) ?? "No athlete profile notes on file.";
    const dailyTargets = new Map((dailyTargetsRes.data ?? []).map(t => [t.date as string, t]));
    const scheduledDays = new Map((scheduledRes.data ?? []).map(d => [d.date as string, d]));
    const templates = targetsRes.data ?? [];

    const days_ctx = dateRange.map(date => {
      const scheduledDay = scheduledDays.get(date) ?? null;
      let dayType = "default";
      if (scheduledDay) {
        if (scheduledDay.is_rest) dayType = "rest";
        else if (scheduledDay.is_key) dayType = "hard";
        else dayType = "easy";
      }
      const templateTarget =
        templates.find(t => t.day_type === dayType) ??
        templates.find(t => t.day_type === "default") ??
        null;
      const target = dailyTargets.get(date) ?? templateTarget;
      const isRestDay = dayType === "rest";
      const workoutContext = scheduledDay && !scheduledDay.is_rest
        ? [scheduledDay.focus, scheduledDay.description].filter(Boolean).join(" · ")
        : isRestDay ? "Rest day" : "No session scheduled";
      return { date, target, isRestDay, workoutContext };
    });

    if (days_ctx.every(d => !d.target)) {
      return NextResponse.json({ error: apiT.noTargetSet }, { status: 400 });
    }

    type TemplateItem = { calories: number; protein_g: number; food_name?: string; quantity_g?: number; serving_qty?: number; serving_label?: string };
    const savedMeals = (templatesRes.data ?? []).map(t => {
      const items = (t.meal_template_items ?? []) as TemplateItem[];
      const cal = items.reduce((s, i) => s + i.calories, 0);
      const p   = items.reduce((s, i) => s + i.protein_g, 0);
      if (variety === "minimal" && items.every(i => i.food_name)) {
        const ingredientList = items.map(i => {
          const qty = i.serving_qty && i.serving_label ? `${i.serving_qty} ${i.serving_label}` : `${i.quantity_g}g`;
          return `${i.food_name} (${qty})`;
        }).join(", ");
        return `- ${t.name} (${t.category ?? "Other"}): ${Math.round(cal)} kcal, P${Math.round(p)}g — ingredients: ${ingredientList}`;
      }
      return `- ${t.name} (${t.category ?? "Other"}): ${Math.round(cal)} kcal, P${Math.round(p)}g`;
    });
    const savedMealsText = savedMeals.length ? savedMeals.join("\n") : "No saved meal templates.";

    const varietyInstruction = variety === "minimal"
      ? "STRONGLY prefer reusing the saved recipes below verbatim (same ingredients, scaled to fit each day's target) instead of inventing new ones — only create a new meal when no saved recipe reasonably fits a slot. Reuse the same handful of ingredients across different slots/days rather than introducing a new one-off ingredient per meal. Minimize the total number of distinct ingredients across the whole week's shopping list — repeating a meal across multiple days is expected and good here, not a flaw."
      : variety === "high"
      ? "Prioritize variety — a different meal for most slots is expected and good."
      : "Reuse the same meal for a given slot on at least 2-3 days this week rather than a fully new recipe daily, and prefer ingredients already used elsewhere in the week over introducing new ones.";

    const recentMeals = (recentRes.data ?? []).map(r => `- ${r.date} ${r.meal_type}: ${r.food_name}`);
    const recentMealsText = recentMeals.length ? recentMeals.join("\n") : "No recent meals logged.";

    const daysText = days_ctx.map(d => {
      const t = d.target;
      const targetText = t ? `${t.calories} kcal | P${t.protein_g}g C${t.carbs_g}g F${t.fat_g}g | Fiber ${t.fiber_g ?? 30}g` : "No target set — use a sensible default for this athlete";
      const slots = d.isRestDay
        ? "breakfast, lunch, dinner, snacks (skip pre_workout/post_workout — rest day)"
        : "breakfast, pre_workout, lunch, post_workout, dinner, snacks (pre/post-workout must be protein-forward, >=20g protein)";
      return `### ${d.date} — ${d.workoutContext}\nTarget: ${targetText}\nSlots to fill: ${slots}`;
    }).join("\n\n");

    // ── Claude prompt ─────────────────────────────────────────────────────
    const systemPrompt = `You are a world-class sports dietitian planning a week of specific, realistic meals for an endurance/strength athlete, so they can plan grocery shopping in advance. You always respond with valid JSON and nothing else — no markdown, no explanation outside the JSON.${languagePromptInstruction(language)}`;

    const userPrompt = `Recommend one specific meal per required meal slot for each of the following ${days} day(s).

## Days to plan
${daysText}

## Athlete profile
${athleteMemory}

## Athlete location & grocery access
${locationText}
Only recommend ingredients that would realistically be available given this — avoid uncommon imported items unless international stores were mentioned.

## Saved meal ideas
${savedMealsText}

## Recent meals before this period (avoid repeating any of these)
${recentMealsText}

## Meal variety for this athlete: ${variety}
${varietyInstruction}

## Task
For each day listed above, fill exactly the slots noted for that day. Each meal needs 2-5 realistic ingredients with plausible gram quantities and per-ingredient macros. Meal totals should roughly sum across all slots to that day's target (a guide, not an exact constraint). Give each meal a short name and a 1-2 sentence rationale. Follow the "Meal variety" instruction above for how much to repeat meals within this period, and avoid anything listed under "Recent meals". Also estimate a few key micronutrients per meal (micros) as a best-effort estimate — not a precise lookup. When an ingredient has a natural discrete unit (bread→slices, eggs→count, banana/apple→count or fraction, avocado→fraction), also include serving_qty (the count, e.g. 2 or 0.5) and serving_label (the singular unit name, e.g. "slice", "banana", "egg") alongside quantity_g. Omit both for ingredients with no natural discrete unit (rice, oats, leafy greens, sauces).

For every ingredient, also include shopping_name — the generic grocery item a shopper would actually put on their shopping list. Strip cooking method and doneness ("Baked cod fillet" -> "Cod", "Grilled chicken thigh" -> "Chicken thigh", "Steamed broccoli" -> "Broccoli"), and generalise personal-choice pantry staples away from a specific flavor or brand the shopper already has their own preference for ("Chocolate whey protein powder" -> "Protein powder", "Vanilla almond milk" -> "Almond milk"). Keep real distinct product types as-is ("Rolled oats", "Greek yogurt", "Canned tuna").

Respond ONLY with this JSON structure:
{
  "days": [
    {
      "date": "2026-01-01",
      "meals": [
        {
          "meal_type": "breakfast",
          "name": "Greek yogurt power bowl",
          "description": "High protein start with slow carbs to fuel the morning.",
          "ingredients": [
            { "food_name": "Greek yogurt", "shopping_name": "Greek yogurt", "quantity_g": 250, "calories": 150, "protein_g": 25, "carbs_g": 9, "fat_g": 0, "fiber_g": 0 },
            { "food_name": "Whole wheat toast", "shopping_name": "Whole wheat bread", "quantity_g": 56, "serving_qty": 2, "serving_label": "slice", "calories": 140, "protein_g": 6, "carbs_g": 26, "fat_g": 2, "fiber_g": 4 }
          ],
          "calories": 450,
          "protein_g": 35,
          "carbs_g": 50,
          "fat_g": 12,
          "fiber_g": 6,
          "micros": { "vitamin_c_mg": 5, "vitamin_d_mcg": 1, "vitamin_a_mcg": 20, "calcium_mg": 250, "iron_mg": 1.5, "magnesium_mg": 40, "potassium_mg": 380, "zinc_mg": 1.2, "sodium_mg": 90, "sugar_g": 18 }
        }
      ]
    }
  ]
}`;

    // Stream: a full week of meals can approach/exceed 8k output tokens, which both
    // truncates non-streaming responses and risks an SDK HTTP timeout above ~16k.
    const stream = claude.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 32000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const response = await stream.finalMessage();

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    type ParsedMeal = {
      meal_type: string; name: string; description?: string;
      ingredients: Array<{
        food_name: string; shopping_name?: string; quantity_g: number;
        serving_qty?: number; serving_label?: string;
        calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number;
      }>;
      calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number;
      micros?: Record<string, number>;
    };
    let parsed: { days: Array<{ date: string; meals: ParsedMeal[] }> };
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      const truncated = response.stop_reason === "max_tokens";
      return NextResponse.json({
        error: truncated ? apiT.truncated : apiT.malformed,
      }, { status: 500 });
    }

    const validDates = new Set(dateRange);
    const rows = (parsed.days ?? [])
      .filter(d => validDates.has(d.date))
      .flatMap(d => (d.meals ?? [])
        .filter(m => MEAL_TYPES.includes(m.meal_type as typeof MEAL_TYPES[number]))
        .map(m => {
          const micros: Record<string, number> = {};
          for (const key of MICRO_KEYS) micros[key] = m.micros?.[key] ?? 0;
          return {
            user_id: uid,
            date: d.date,
            meal_type: m.meal_type,
            name: m.name,
            description: m.description ?? null,
            ingredients: m.ingredients ?? [],
            calories: Math.round(m.calories),
            protein_g: m.protein_g,
            carbs_g: m.carbs_g,
            fat_g: m.fat_g,
            fiber_g: m.fiber_g ?? 0,
            micros,
            source: "manual",
            updated_at: new Date().toISOString(),
          };
        }));

    if (!rows.length) {
      return NextResponse.json({ error: apiT.noValidMeals }, { status: 500 });
    }

    // Clear any previously-generated recommendations across this date range first (e.g. a prior
    // generation may have included pre/post_workout slots that no longer apply on a rest day).
    const { error: deleteErr } = await sb
      .from("nutrition_meal_recommendations")
      .delete()
      .eq("user_id", uid)
      .gte("date", startDate)
      .lte("date", endDate);
    if (deleteErr) throw deleteErr;

    const { data: saved, error: saveErr } = await sb
      .from("nutrition_meal_recommendations")
      .insert(rows)
      .select();

    if (saveErr) throw saveErr;

    return NextResponse.json({ data: saved ?? [] });
  } catch (err) {
    return NextResponse.json(serializeError(err), { status: 500 });
  }
}
