import type { StrengthSession } from "./types";

// "8-12" for a range, "5" when min == max (a fixed-rep prescription, not a range).
export function formatReps(repsMin: number, repsMax: number): string {
  return repsMin === repsMax ? `${repsMin}` : `${repsMin}-${repsMax}`;
}

// The touch-and-go primary barbell bench specifically — not Incline DB Bench (different Garmin
// category) and not the paused/close-grip variants (same category, but a different strength curve
// the stored 1RM doesn't describe). Those variants only get a weight shown once real completed
// history exists for them (getWeightRecommendation) — no formula fallback, since sharing the
// touch-and-go 1RM estimate across variants was the exact bug this whole system replaced.
export function isBarbellBench(garminCategory: string | null, displayName: string): boolean {
  return garminCategory === "BENCH_PRESS" && /barbell/i.test(displayName) && !/paused|close-grip/i.test(displayName);
}

// Estimates a barbell bench working weight from the athlete's current 1RM: Brzycki formula with a
// fixed 2-RIR offset (matches the "1-2 RIR, never to failure" bench rule), rounded to the nearest
// 2.5kg plate increment. Validated against a real session (102.5kg @ 5x5, 1-2 RIR on the last set,
// 125kg 1RM) — landed within one plate increment. This is a starting-point estimate to load up to
// and autoregulate from by feel, not a rigid prescription.
export function estimateBenchWeight(oneRMKg: number, repsMin: number, repsMax: number): number | null {
  const reps = (repsMin + repsMax) / 2;
  const RIR_OFFSET = 2;
  const effectiveReps = reps + RIR_OFFSET;
  if (effectiveReps >= 37) return null; // outside the formula's valid range
  const raw = oneRMKg * (37 - effectiveReps) / 36;
  return Math.round(raw / 2.5) * 2.5;
}

export interface CompletedSetRow {
  date: string;
  reps: number;
  weight_kg: number;
  prescribed_reps_min: number | null;
}

export interface WeightRecommendation {
  action: "increase" | "repeat" | "decrease" | "no_data";
  weight: number | null;
  note: string;
}

function groupSessionsByDate(sets: CompletedSetRow[]): { date: string; sets: CompletedSetRow[] }[] {
  const byDate = new Map<string, CompletedSetRow[]>();
  for (const s of sets) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }
  return [...byDate.entries()]
    .map(([date, sets]) => ({ date, sets }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Decides what weight to use next for a specific exercise, based on actual completed performance
// rather than a 1RM-derived formula — this is what lets each bench variant (paused, close-grip,
// touch-and-go) track its own history instead of sharing one number.
//
// Garmin doesn't capture subjective RIR, so "did you complete every prescribed rep on every set"
// is the signal used instead: missing reps means the weight was too heavy (hold/drop); two
// consecutive fully-successful sessions at the SAME weight means it's time to add weight (classic
// double progression); a single success just repeats — one clean session at a 1-2 RIR target is
// the expected outcome, not evidence the weight was too light.
export function getWeightRecommendation(completedSets: CompletedSetRow[]): WeightRecommendation {
  const sessions = groupSessionsByDate(completedSets);
  if (sessions.length === 0) {
    return { action: "no_data", weight: null, note: "No completed data yet for this exercise." };
  }

  const wasFullySuccessful = (sets: CompletedSetRow[]) =>
    sets.every(s => s.prescribed_reps_min == null || s.reps >= s.prescribed_reps_min);

  const last = sessions[0];
  const lastWeight = last.sets[0]?.weight_kg ?? null;

  if (!wasFullySuccessful(last.sets)) {
    const dropped = lastWeight != null ? lastWeight - 2.5 : null;
    return {
      action: "decrease",
      weight: dropped,
      note: `Missed reps at ${lastWeight}kg last time — try ${dropped}kg or hold and repeat.`,
    };
  }

  const prev = sessions[1];
  const prevSameWeight = prev != null && prev.sets[0]?.weight_kg === lastWeight;
  if (prevSameWeight && wasFullySuccessful(prev.sets)) {
    const next = lastWeight != null ? lastWeight + 2.5 : null;
    return {
      action: "increase",
      weight: next,
      note: `Hit full reps at ${lastWeight}kg two sessions in a row — try ${next}kg next time.`,
    };
  }

  return {
    action: "repeat",
    weight: lastWeight,
    note: `Hit full reps at ${lastWeight}kg last time — repeat to confirm before adding weight.`,
  };
}

// Index strength-session rows (with joined exercises) by date,
// exercises sorted by display_order. Shared by the dashboard, plan, and week pages.
export function buildStrengthMap(
  rows: (StrengthSession & { exercises?: { display_order: number }[] })[] | null | undefined
): Record<string, StrengthSession> {
  const map: Record<string, StrengthSession> = {};
  for (const s of rows ?? []) {
    map[s.date] = {
      ...s,
      exercises: [...(s.exercises ?? [])].sort((a, b) => a.display_order - b.display_order),
    } as StrengthSession;
  }
  return map;
}
