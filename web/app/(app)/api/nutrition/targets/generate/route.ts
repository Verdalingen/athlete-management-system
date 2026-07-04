import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient, getUserId } from "@/lib/supabase-server";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DAY_TYPES = ["default", "hard", "easy", "rest"] as const;

export async function POST() {
  try {
    const uid = await getUserId();
    const sb = createServerClient();

    // ── Gather context in parallel ────────────────────────────────────────
    const [memoryRes, metricsRes, weightRes, targetsRes] = await Promise.all([
      sb.rpc("get_athlete_memory", { p_user_id: uid }),
      sb.from("daily_metrics")
        .select("date,ctl,atl,tsb,acwr,ramp_7d,rhr,hrv_overnight,sleep_score")
        .eq("user_id", uid)
        .order("date", { ascending: false })
        .limit(14),
      sb.from("body_weight_log")
        .select("date,weight_kg")
        .eq("user_id", uid)
        .order("date", { ascending: false })
        .limit(30),
      sb.from("nutrition_targets")
        .select("*")
        .eq("user_id", uid),
    ]);

    const athleteMemory = (memoryRes.data as string) ?? "No athlete memory on file.";
    const metrics = metricsRes.data ?? [];
    const weights = weightRes.data ?? [];
    const existingTargets = targetsRes.data ?? [];

    // ── Summarise context ─────────────────────────────────────────────────
    const latestMetrics = metrics[0];
    const currentWeight = weights[0]?.weight_kg ?? null;
    const avgWeight7d = weights.slice(0, 7).length
      ? (weights.slice(0, 7).reduce((s, r) => s + Number(r.weight_kg), 0) / weights.slice(0, 7).length).toFixed(1)
      : null;

    const metricsText = latestMetrics
      ? `Latest training metrics (${latestMetrics.date}):
- CTL (chronic load): ${latestMetrics.ctl?.toFixed(1) ?? "n/a"}
- ATL (acute load):   ${latestMetrics.atl?.toFixed(1) ?? "n/a"}
- TSB (form):         ${latestMetrics.tsb?.toFixed(1) ?? "n/a"}
- ACWR:               ${latestMetrics.acwr ?? "n/a"}
- Ramp rate (7d CTL change): ${latestMetrics.ramp_7d?.toFixed(1) ?? "n/a"}
- Resting HR: ${latestMetrics.rhr ?? "n/a"} bpm
- HRV: ${latestMetrics.hrv_overnight?.toFixed(1) ?? "n/a"} ms
- Sleep score: ${latestMetrics.sleep_score ?? "n/a"}`
      : "No training metrics on file.";

    const weightText = currentWeight
      ? `Body weight: ${currentWeight} kg (7d avg: ${avgWeight7d ?? "n/a"} kg)`
      : "No body weight on file.";

    const existingText = existingTargets.length
      ? "Current targets:\n" + existingTargets.map(t =>
          `  ${t.day_type}: ${t.calories} kcal | P${t.protein_g}g C${t.carbs_g}g F${t.fat_g}g | source: ${t.source}`
        ).join("\n")
      : "No targets set yet.";

    // ── Claude prompt ─────────────────────────────────────────────────────
    const systemPrompt = `You are a sports dietitian and endurance coach. Your job is to set daily macro targets for an athlete based on their training load and goals. You always respond with valid JSON and nothing else — no markdown, no explanation outside the JSON.`;

    const userPrompt = `Set personalised nutrition targets for each training day type for this athlete.

## Athlete profile
${athleteMemory}

## Training load
${metricsText}

## Body composition
${weightText}

## Existing targets (for reference)
${existingText}

## Task
Return targets for all four day types: default, hard, easy, rest.

Guidelines:
- Base calories on body weight (if available) and training load
- Hard day: highest carbs to fuel sessions and replenish glycogen
- Easy day: moderate carbs, slightly reduced calories
- Rest day: lowest carbs and calories, maintain protein
- Default: a reasonable middle ground used when day type is unknown
- Protein: 1.8–2.4 g/kg body weight (or estimate from goals if weight unknown)
- Fat: ≥20% of total calories minimum
- Fiber: 25–35g across all day types
- Water: 35–40ml/kg + 500–1000ml per hour of training on hard days
- Reflect the athlete's goals (e.g. muscle gain = higher protein + slight surplus)
- TSB < -20 suggests heavy load: increase carbs/calories on hard days
- TSB > +10 suggests taper/low load: can reduce slightly

Respond ONLY with this JSON structure:
{
  "targets": [
    {
      "day_type": "default",
      "calories": 2400,
      "protein_g": 170,
      "carbs_g": 260,
      "fat_g": 75,
      "fiber_g": 30,
      "water_ml": 3000,
      "notes": "one sentence rationale"
    }
  ]
}`;

    const response = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    let parsed: { targets: Array<{
      day_type: string; calories: number; protein_g: number;
      carbs_g: number; fat_g: number; fiber_g: number; water_ml: number; notes?: string;
    }> };
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      return NextResponse.json({ error: "Coach returned malformed response. Try again." }, { status: 500 });
    }

    const validTargets = (parsed.targets ?? []).filter(t => DAY_TYPES.includes(t.day_type as typeof DAY_TYPES[number]));
    if (!validTargets.length) {
      return NextResponse.json({ error: "No valid targets in coach response." }, { status: 500 });
    }

    // ── Upsert all targets ────────────────────────────────────────────────
    const rows = validTargets.map(t => ({
      user_id: uid,
      day_type: t.day_type,
      calories: Math.round(t.calories),
      protein_g: Math.round(t.protein_g),
      carbs_g: Math.round(t.carbs_g),
      fat_g: Math.round(t.fat_g),
      fiber_g: Math.round(t.fiber_g),
      water_ml: Math.round(t.water_ml),
      notes: t.notes ?? null,
      source: "coach",
      updated_at: new Date().toISOString(),
    }));

    const { data: saved, error: saveErr } = await sb
      .from("nutrition_targets")
      .upsert(rows, { onConflict: "user_id,day_type" })
      .select();

    if (saveErr) throw saveErr;

    // Also write today's daily target using the day-type that matches today's scheduled session
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: todaySchedule } = await sb
      .from("scheduled_days")
      .select("is_rest,is_key,focus,description")
      .eq("user_id", uid)
      .eq("date", todayStr)
      .limit(1)
      .maybeSingle();

    const todayDayType = todaySchedule
      ? (todaySchedule.is_rest ? "rest" : todaySchedule.is_key ? "hard" : "easy")
      : "default";

    const todayTemplate = validTargets.find(t => t.day_type === todayDayType)
      ?? validTargets.find(t => t.day_type === "default");

    if (todayTemplate) {
      const workoutContext = todaySchedule && !todaySchedule.is_rest
        ? [todaySchedule.focus, todaySchedule.description].filter(Boolean).join(" · ")
        : null;
      const { error: dailyErr } = await sb.from("nutrition_daily_targets").upsert({
        user_id: uid,
        date: todayStr,
        calories: Math.round(todayTemplate.calories),
        protein_g: Math.round(todayTemplate.protein_g),
        carbs_g: Math.round(todayTemplate.carbs_g),
        fat_g: Math.round(todayTemplate.fat_g),
        fiber_g: Math.round(todayTemplate.fiber_g),
        water_ml: Math.round(todayTemplate.water_ml),
        workout_context: workoutContext,
        notes: todayTemplate.notes ?? null,
        source: "manual",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,date" });
      if (dailyErr) console.error("nutrition_daily_targets upsert failed:", dailyErr);
    }

    return NextResponse.json({ targets: saved });
  } catch (err) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 });
  }
}
