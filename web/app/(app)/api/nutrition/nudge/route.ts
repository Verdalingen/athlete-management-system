import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient, getUserId } from "@/lib/supabase-server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  try {
    const uid = await getUserId();
    const sb = createServerClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await sb
      .from("nutrition_nudges")
      .select("message,tomorrow_session,created_at")
      .eq("user_id", uid)
      .eq("date", today)
      .maybeSingle();

    return NextResponse.json({ nudge: data ?? null });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const uid = await getUserId();
    const sb = createServerClient();
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const [diaryRes, targetRes, dailyTargetRes, tomorrowRes, weightRes, memoryRes] = await Promise.all([
      sb.from("nutrition_diary").select("meal_type,food_name,calories,protein_g,carbs_g,fat_g,fiber_g,sodium_mg,sugar_g").eq("user_id", uid).eq("date", today),
      sb.from("nutrition_targets").select("*").eq("user_id", uid).eq("day_type", "default").maybeSingle(),
      sb.from("nutrition_daily_targets").select("*").eq("user_id", uid).eq("date", today).maybeSingle(),
      sb.from("scheduled_days").select("session_type,focus,description,is_rest,is_key").eq("user_id", uid).eq("date", tomorrow).maybeSingle(),
      sb.from("body_weight_log").select("weight_kg").eq("user_id", uid).order("date", { ascending: false }).limit(1).maybeSingle(),
      sb.rpc("get_athlete_memory", { p_user_id: uid }),
    ]);

    const entries = diaryRes.data ?? [];
    const target = dailyTargetRes.data ?? targetRes.data;
    const tomorrowPlan = tomorrowRes.data;
    const weightKg = weightRes.data?.weight_kg ?? null;
    const athleteMemory = (memoryRes.data as string) ?? "";

    // Aggregate today's totals
    const sum = (key: string) => Math.round(entries.reduce((s, e) => s + ((e as Record<string, number>)[key] ?? 0), 0));
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const totals = {
      calories: sum("calories"),
      protein_g: r1(entries.reduce((s, e) => s + (e.protein_g ?? 0), 0)),
      carbs_g: r1(entries.reduce((s, e) => s + (e.carbs_g ?? 0), 0)),
      fat_g: r1(entries.reduce((s, e) => s + (e.fat_g ?? 0), 0)),
      fiber_g: r1(entries.reduce((s, e) => s + (e.fiber_g ?? 0), 0)),
      sodium_mg: sum("sodium_mg"),
      sugar_g: r1(entries.reduce((s, e) => s + (e.sugar_g ?? 0), 0)),
    };

    // Timing gaps
    const preP  = r1(entries.filter(e => e.meal_type === "pre_workout").reduce((s, e) => s + (e.protein_g ?? 0), 0));
    const postP = r1(entries.filter(e => e.meal_type === "post_workout").reduce((s, e) => s + (e.protein_g ?? 0), 0));
    const preLogged  = entries.some(e => e.meal_type === "pre_workout");
    const postLogged = entries.some(e => e.meal_type === "post_workout");

    const tomorrowDesc = tomorrowPlan
      ? tomorrowPlan.is_rest
        ? "Rest day"
        : `${tomorrowPlan.focus ?? tomorrowPlan.session_type}${tomorrowPlan.description ? ` — ${tomorrowPlan.description}` : ""}${tomorrowPlan.is_key ? " (KEY SESSION)" : ""}`
      : "No session scheduled";

    const prompt = `You are Adrian's personal AI sports coach. Write a concise evening nutrition nudge — 2-3 sentences max. Be direct and specific; use exact numbers. Reference tomorrow's session if relevant.

## Today's intake vs target
Calories:  ${totals.calories} / ${target?.calories ?? "?"} kcal
Protein:   ${totals.protein_g}g / ${target?.protein_g ?? "?"}g
Carbs:     ${totals.carbs_g}g / ${target?.carbs_g ?? "?"}g
Fat:       ${totals.fat_g}g / ${target?.fat_g ?? "?"}g
Fiber:     ${totals.fiber_g}g / ${target?.fiber_g ?? 30}g
Sodium:    ${totals.sodium_mg}mg (max ~2300mg)
Sugar:     ${totals.sugar_g}g

## Nutrient timing
Pre-workout:  ${preLogged ? `${preP}g protein ${preP >= 20 ? "✓" : "⚠ low"}` : "nothing logged"}
Post-workout: ${postLogged ? `${postP}g protein ${postP >= 20 ? "✓" : "⚠ low"}` : "nothing logged"}

## Tomorrow's session
${tomorrowDesc}

## Athlete context
Weight: ${weightKg ? `${weightKg}kg` : "unknown"}
${athleteMemory ? athleteMemory.slice(0, 400) : ""}

Write only the nudge message — no greeting, no sign-off, no markdown. Plain prose, 2-3 sentences.`;

    const response = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const message = response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "Check your macros and rest up for tomorrow.";

    // Upsert the nudge for today
    const { error: saveErr } = await sb.from("nutrition_nudges").upsert({
      user_id: uid,
      date: today,
      message,
      tomorrow_session: tomorrowPlan && !tomorrowPlan.is_rest
        ? [tomorrowPlan.focus, tomorrowPlan.description].filter(Boolean).join(" · ")
        : null,
    }, { onConflict: "user_id,date" });

    if (saveErr) throw saveErr;

    return NextResponse.json({ nudge: { message, tomorrow_session: tomorrowPlan?.description ?? null } });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 });
  }
}
