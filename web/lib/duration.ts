// Best-effort duration parsing for scheduled-day free-form descriptions —
// the only source of duration for non-strength session types (strength
// sessions have a real estimated_duration_secs column instead). Extracted
// from SessionDetailModal.tsx so it can also power Plan page weekly
// time-by-type totals — see web/DESIGN.md "Weekly time-by-type stats".

// Sums every duration token in `text`: "M:SSmin" ("2:30min" = 2m30s, which a naive \d+min
// match misreads as a whole 30 minutes), plain minutes ("2.5min"), and bare seconds
// ("90s"/"30sec", common in recovery notation like "90s jog r").
export function sumMinuteTokens(text: string): number {
  let total = 0;
  for (const m of text.matchAll(/(\d+):(\d+)\s*min|(\d+(?:\.\d+)?)\s*min|(\d+(?:\.\d+)?)\s*s(?:ec)?\b/gi)) {
    if (m[1] !== undefined) total += parseInt(m[1]) + parseInt(m[2]) / 60;
    else if (m[3] !== undefined) total += parseFloat(m[3]);
    else if (m[4] !== undefined) total += parseFloat(m[4]) / 60;
  }
  return total;
}

// Estimates work-segment duration from "Xkm @ M:SS-M:SS/km" or "Xm @ M:SS-M:SS/km" notation,
// for interval formats that specify distance+pace instead of an explicit minute duration.
export function estimateDistancePaceMinutes(text: string): number {
  let total = 0;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(km|m)\b\s*@\s*(\d+):(\d+)(?:-(\d+):(\d+))?\s*\/km/gi)) {
    const rawDistance = parseFloat(m[1]);
    const distanceKm = m[2].toLowerCase() === "km" ? rawDistance : rawDistance / 1000;
    const paceLowSec = parseInt(m[3]) * 60 + parseInt(m[4]);
    const paceHighSec = m[5] !== undefined ? parseInt(m[5]) * 60 + parseInt(m[6]) : paceLowSec;
    total += distanceKm * ((paceLowSec + paceHighSec) / 2 / 60);
  }
  return total;
}

interface DurationResult {
  minutes: number;
  exact: boolean;
  exactLabel?: string;
}

// Shared core: mirrors the original parseDurationLabel's branching exactly
// (grouped intervals → legacy shorthand → single bare duration → fallback
// sum), just split so both the numeric and label helpers below stay in sync
// off one code path instead of two regexes drifting apart.
function computeDuration(description: string): DurationResult | null {
  // Grouped intervals: N×(...) blocks, e.g. "5x(1km @3:50-4:00/km, 2:30min r)"
  let total = 0;
  let rest = description;
  let hasGrouped = false;
  for (const bm of description.matchAll(/(\d+)\s*[×x]\s*\(([^)]+)\)/gi)) {
    hasGrouped = true;
    const reps = parseInt(bm[1]);
    const inner = sumMinuteTokens(bm[2]) + estimateDistancePaceMinutes(bm[2]);
    total += reps * inner;
    rest = rest.replace(bm[0], "");
  }
  if (hasGrouped) {
    // Add any standalone duration/distance segments outside the blocks (warm-up, cool-down, etc.)
    total += sumMinuteTokens(rest) + estimateDistancePaceMinutes(rest);
    return total > 0 ? { minutes: Math.round(total), exact: false } : null;
  }

  // Legacy shorthand without parens: "A×Bmin work (Crec)"
  const iv = description.match(/(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*min/i);
  if (iv) {
    const reps = parseInt(iv[1]), work = parseFloat(iv[2]);
    total += reps * work;
    // Recovery per rep: (Cmin ...) or (Cs ...)
    const rec = description.match(/\((\d+(?:\.\d+)?)\s*(min|s)\b/i);
    if (rec) {
      const v = parseFloat(rec[1]);
      total += reps * (rec[2].toLowerCase() === "s" ? v / 60 : v);
    }
    return total > 0 ? { minutes: Math.round(total), exact: false } : null;
  }

  // No intervals: a single bare "Nmin" / "N-Mmin" duration (no other segments) is shown
  // exactly as written; anything with multiple duration/distance segments (warm-up + main +
  // cool-down, etc.) is summed and marked approximate.
  const minMatches = [...description.matchAll(/(\d+(?:-\d+)?)\s*min/gi)];
  const hasDistance = /\d+(?:\.\d+)?\s*km\b/i.test(description);
  if (minMatches.length === 1 && !hasDistance) {
    const raw = minMatches[0][1];
    const numeric = raw.includes("-")
      ? Math.round(raw.split("-").map(Number).reduce((a, b) => a + b, 0) / 2)
      : parseInt(raw, 10);
    return { minutes: numeric, exact: true, exactLabel: `${raw} min` };
  }

  const sum = sumMinuteTokens(description) + estimateDistancePaceMinutes(description);
  return sum > 0 ? { minutes: Math.round(sum), exact: false } : null;
}

/** Best-effort total minutes for a scheduled day's description. Used for
 * Plan page weekly time-by-type totals and anywhere else a plain number
 * (not a display label) is needed. */
export function estimateDurationMinutes(description: string | null): number | null {
  if (!description) return null;
  return computeDuration(description)?.minutes ?? null;
}

/** Display label — a single stated duration ("45min") is shown exactly as
 * written; anything summed from multiple segments is marked approximate
 * ("~52 min"). Used by SessionDetailModal's duration badge. */
export function formatDurationLabel(description: string | null): string | null {
  if (!description) return null;
  const r = computeDuration(description);
  if (!r) return null;
  return r.exact ? r.exactLabel! : `~${r.minutes} min`;
}
