import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { AthleteProfile } from "@/app/actions/athlete-profile";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatProfileForPrompt(p: AthleteProfile): string {
  const lines: string[] = [];

  lines.push("=== GOALS ===");
  lines.push(`Primary goal type: ${p.primary_goal_type || "not specified"}`);
  lines.push(`Primary goal detail: ${p.primary_goal_detail || "not specified"}`);
  lines.push(`Weight goal: ${p.weight_goal_direction || "maintain"}`);
  if (p.secondary_goals) lines.push(`Secondary goals: ${p.secondary_goals}`);
  if (p.goal_timeline) lines.push(`Target timeline: ${p.goal_timeline}`);
  if (p.events?.length) {
    lines.push("Upcoming events:");
    for (const e of p.events) {
      lines.push(`  - ${e.name} on ${e.date} (${e.priority} priority${e.target_time ? `, target: ${e.target_time}` : ""})`);
    }
  }

  lines.push("\n=== ATHLETIC BACKGROUND ===");
  if (p.training_years_strength) lines.push(`Strength training experience: ${p.training_years_strength}`);
  if (p.training_years_cardio)   lines.push(`Cardio/running experience: ${p.training_years_cardio}`);
  if (p.sport_background)        lines.push(`Sport background: ${p.sport_background}`);
  if (p.sessions_per_week)       lines.push(`Current training: ${p.sessions_per_week} sessions/week`);
  if (p.hours_per_week)          lines.push(`Weekly volume: ~${p.hours_per_week} hours`);

  lines.push("\n=== CURRENT FITNESS BENCHMARKS ===");
  if (p.bench_1rm_kg)    lines.push(`Bench press 1RM: ${p.bench_1rm_kg} kg`);
  if (p.squat_1rm_kg)    lines.push(`Squat 1RM: ${p.squat_1rm_kg} kg`);
  if (p.deadlift_1rm_kg) lines.push(`Deadlift 1RM: ${p.deadlift_1rm_kg} kg`);
  if (p.run_5k_time)     lines.push(`5k time: ${p.run_5k_time}`);
  if (p.run_10k_time)    lines.push(`10k time: ${p.run_10k_time}`);
  if (p.other_benchmarks) lines.push(`Other: ${p.other_benchmarks}`);

  lines.push("\n=== SCHEDULE & EQUIPMENT ===");
  if (p.available_days?.length) lines.push(`Available training days: ${p.available_days.join(", ")}`);
  if (p.session_duration_mins)  lines.push(`Max session length: ${p.session_duration_mins} minutes`);
  lines.push(`Gym access: ${p.gym_access ? "Yes" : "No"}`);
  if (p.equipment_notes)  lines.push(`Equipment: ${p.equipment_notes}`);
  if (p.schedule_notes)   lines.push(`Schedule constraints: ${p.schedule_notes}`);

  lines.push("\n=== HEALTH & LIMITATIONS ===");
  lines.push(`Current injuries: ${p.current_injuries || "None"}`);
  lines.push(`Injury history: ${p.injury_history || "None"}`);
  lines.push(`Exercises to avoid: ${p.exercises_to_avoid || "None"}`);
  if (p.health_notes) lines.push(`Other health notes: ${p.health_notes}`);

  lines.push("\n=== TRAINING PREFERENCES ===");
  if (p.preferred_style)      lines.push(`Training style preference: ${p.preferred_style}`);
  if (p.training_enjoyments)  lines.push(`Enjoys: ${p.training_enjoyments}`);
  if (p.training_dislikes)    lines.push(`Dislikes: ${p.training_dislikes}`);
  if (p.indoor_outdoor)       lines.push(`Cardio preference: ${p.indoor_outdoor}`);
  if (p.additional_notes)     lines.push(`Additional notes: ${p.additional_notes}`);

  return lines.join("\n");
}

const SYSTEM = `You are an elite sports coach generating a structured athlete brief for an AI training plan system.

Your output will be fed directly into an AI planning agent that generates personalised training plans. Write with precision and authority — like a coach briefing a colleague, not a marketing document. Be specific, opinionated, and actionable.

Write a comprehensive briefing covering goals, background, current fitness level, injury/health considerations, and training preferences. Use clear section headers. This is used to understand WHO the athlete is and WHAT they're trying to achieve. Do NOT include periodisation or phasing recommendations — the planning agent handles that independently using Garmin activity data. Do NOT restate scheduling constraints, session-length limits, equipment, or exercises to avoid as operational rules — those are handled deterministically elsewhere; focus purely on the athlete's narrative context.

Do not add preambles, disclaimers, or closing remarks. Start immediately with the briefing.`;

export async function POST(req: NextRequest) {
  try {
    const profile: AthleteProfile = await req.json();
    const profileText = formatProfileForPrompt(profile);

    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: `Athlete profile:\n\n${profileText}` }],
    });

    const textBlock = message.content.find(
      (block): block is { type: "text"; text: string; citations: null } => block.type === "text"
    );
    if (!textBlock) {
      console.error("[generate-context] No text block in Claude response:", {
        stop_reason: message.stop_reason,
        content_types: message.content.map(b => b.type),
      });
      return NextResponse.json(
        { error: `Coach returned no text content (stop_reason: ${message.stop_reason}). Try again.` },
        { status: 502 }
      );
    }

    const analysisContext = textBlock.text.trim();
    return NextResponse.json({ analysisContext });
  } catch (err) {
    console.error("[generate-context] Failed:", err);
    const e = err as { message?: string };
    return NextResponse.json({ error: e?.message ?? String(err) }, { status: 500 });
  }
}
