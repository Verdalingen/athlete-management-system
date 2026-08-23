import { createServerClient, getUserId } from "@/lib/supabase-server";
import { getAthleteProfile } from "@/app/actions/athlete-profile";
import type { CompletedActivity } from "@/lib/types";
import ProgressTabs, { type TrendSeries, type ZoneBand, type ZoneLine } from "./ProgressTabs";

export default async function ProgressPage() {
  const sb = createServerClient();
  const uid = await getUserId();

  const activityHistoryStart = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

  const [latestRes, dailyMetricsRes, fallbackTrendRes, weeklyReviewRes, athleteProfile, completedActivitiesRes, benchRes] = await Promise.all([
    sb
      .from("analyses")
      .select("analysis_html, planning_html, report_date")
      .eq("user_id", uid)
      .order("report_date", { ascending: false })
      .limit(1),

    sb
      .from("daily_metrics")
      // No .limit() — with ascending order, a limit here silently drops the MOST
      // RECENT days once the account has more than the limit's worth of rows (this
      // account is already past 365), the opposite of what "recent trend" needs.
      .select("date, ctl, atl, tsb, acwr, ramp_7d, vo2max_running, vo2max_cycling, rhr, hrv_overnight, sleep_score, sleep_hours, body_battery, weight_kg, stress_avg, total_calories, predicted_5k_secs, predicted_10k_secs, predicted_half_marathon_secs, predicted_marathon_secs")
      .eq("user_id", uid)
      .order("date", { ascending: true }),

    sb
      .from("analyses")
      .select("report_date, kpis")
      .eq("user_id", uid)
      .not("kpis", "is", null)
      .order("report_date", { ascending: true })
      .limit(90),

    sb
      .from("weekly_reviews")
      .select("summary_html, week_start, kpi_delta")
      .eq("user_id", uid)
      .order("week_start", { ascending: false })
      .limit(1),

    getAthleteProfile(),

    sb
      .from("completed_activities")
      .select("*")
      .eq("user_id", uid)
      .gte("date", activityHistoryStart),

    // Bench e1RM long-term trend — a per-report snapshot column on `analyses` (same
    // table the dashboard reads just the latest row from for its Goals card), so the
    // full history doubles as a ready-made time series with no new storage. Race-time
    // predictions used to live here too but moved to daily_metrics (see migration 038)
    // once dense daily history became available — Garmin recomputes a race prediction
    // every day, unlike bench e1RM which only exists on days a bench session was logged.
    sb
      .from("analyses")
      .select("report_date, bench_e1rm_kg")
      .eq("user_id", uid)
      .order("report_date", { ascending: true }),
  ]);

  const latest = latestRes.data?.[0] ?? null;
  const completedActivities: CompletedActivity[] = completedActivitiesRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dailyRows: Record<string, any>[] = dailyMetricsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fallbackRows: { report_date: string; kpis: Record<string, any> }[] = fallbackTrendRes.data ?? [];
  const benchRows: { report_date: string; bench_e1rm_kg: number | null }[] = benchRes.data ?? [];
  const weeklyReview = weeklyReviewRes.data?.[0] ?? null;
  const events = (athleteProfile?.events ?? []).filter(
    (e: { date: string }) => e.date >= new Date().toISOString().slice(0, 10)
      || (new Date().getTime() - new Date(e.date).getTime()) < 30 * 24 * 60 * 60 * 1000,
  );

  const useDailyMetrics = dailyRows.length >= 3;

  // ── HRV personal baseline (dynamic) ──────────────────────────────────────
  const hrvValues = dailyRows
    .map(r => r.hrv_overnight as number | null)
    .filter((v): v is number => v != null);
  const hrvMean = hrvValues.length > 0
    ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
    : null;
  const hrvStd = hrvMean != null && hrvValues.length > 1
    ? Math.sqrt(hrvValues.reduce((s, v) => s + (v - hrvMean) ** 2, 0) / hrvValues.length)
    : null;

  // ── Zone colour constants ─────────────────────────────────────────────────
  const Z = {
    green:   "rgba(34,197,94,0.16)",
    amber:   "rgba(245,158,11,0.15)",
    red:     "rgba(var(--red-rgb),.15)",
    neutral: "rgba(148,163,184,0.09)",
    lineG:   "rgba(34,197,94,0.8)",
    lineA:   "rgba(245,158,11,0.8)",
    lineR:   "rgba(239,68,68,0.8)",
  };

  // ── Recovery composite (0–100): HRV×35% + sleep×30% + battery×25% + RHR×10%
  const recoveryData = dailyRows.map(r => {
    let score = 0, weight = 0;
    const hrv: number | null = r.hrv_overnight;
    const sleep: number | null = r.sleep_score;
    const battery: number | null = r.body_battery;
    const rhr: number | null = r.rhr;
    if (hrv != null && hrvMean != null && hrvMean > 0) {
      score  += Math.min(100, Math.max(0, (hrv / hrvMean) * 70 + 30)) * 0.35;
      weight += 0.35;
    }
    if (sleep != null)   { score += sleep * 0.30;   weight += 0.30; }
    if (battery != null) { score += battery * 0.25; weight += 0.25; }
    if (rhr != null) {
      score  += Math.min(100, Math.max(0, 100 - (rhr - 40) * 2)) * 0.10;
      weight += 0.10;
    }
    return { date: r.date as string, value: weight > 0 ? Math.round(score / weight) : null };
  });

  let trendSeries: TrendSeries[];

  if (useDailyMetrics) {
    trendSeries = [
      // ── ACWR — workload safety (from the article) ───────────────────────
      {
        label: "Workload Ratio (ACWR)",
        unit: "",
        color: "#7c3aed",
        decimals: 2,
        zoneBands: [
          { min: -Infinity, max: 0.8,  fill: Z.amber, severity: "warning", label: "Under-training (<0.8)",  chartLabel: "Under-training" },
          { min: 0.8,       max: 1.3,  fill: Z.green, severity: "optimal", label: "Optimal zone (0.8–1.3)", chartLabel: "Optimal Zone" },
          { min: 1.3,       max: Infinity, fill: Z.red, severity: "danger", label: "Risk zone (>1.3)",      chartLabel: "Risk Zone" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: 0.8, label: "0.8", color: Z.lineG },
          { value: 1.3, label: "1.3", color: Z.lineR },
        ] satisfies ZoneLine[],
        data: dailyRows.map(r => ({ date: r.date, value: r.acwr ?? null })),
      },

      // ── CTL / ATL / TSB — shown together in PMC ─────────────────────────
      {
        label: "Fitness (CTL)",
        unit: "load", color: "var(--accent)", decimals: 1, higherIsBetter: true,
        data: dailyRows.map(r => ({ date: r.date, value: r.ctl ?? null })),
      },
      {
        label: "Form (TSB)",
        unit: "", color: "var(--accent)", decimals: 1,
        zoneBands: [
          { min: -Infinity, max: -30, fill: Z.red,     severity: "danger",  label: "Overreaching (<-30)",   chartLabel: "Overreaching" },
          { min: -30,       max: -10, fill: Z.amber,   severity: "warning", label: "Training load (-30–-10)", chartLabel: "Training load" },
          { min: -10,       max: 5,   fill: Z.green,   severity: "optimal", label: "Race-ready (-10 to +5)", chartLabel: "Race-ready" },
          { min: 5,         max: 25,  fill: Z.neutral, severity: "neutral", label: "Fresh (+5 to +25)",      chartLabel: "Fresh" },
          { min: 25, max: Infinity,   fill: Z.amber,   severity: "warning", label: "Overtapered (>+25)",     chartLabel: "Overtapered" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: -30, label: "-30", color: Z.lineR },
          { value: -10, label: "-10", color: Z.lineG },
          { value:   0, label: "0",   color: "rgba(148,163,184,0.5)" },
          { value:  25, label: "+25", color: Z.lineA },
        ] satisfies ZoneLine[],
        data: dailyRows.map(r => ({ date: r.date, value: r.tsb ?? null })),
      },
      {
        label: "Fatigue (ATL)",
        unit: "load", color: "var(--red)", decimals: 1,
        data: dailyRows.map(r => ({ date: r.date, value: r.atl ?? null })),
      },

      // ── Recovery composite ──────────────────────────────────────────────
      {
        label: "Recovery Score",
        unit: "/100", color: "#34d399", decimals: 0, higherIsBetter: true,
        zoneBands: [
          { min: -Infinity, max: 40,  fill: Z.red,   severity: "danger",  label: "Recovery required (<40)", chartLabel: "Recovery required" },
          { min: 40,        max: 65,  fill: Z.amber, severity: "warning", label: "Caution zone (40–65)",    chartLabel: "Caution" },
          { min: 65,        max: Infinity, fill: Z.green, severity: "optimal", label: "Optimal recovery (>65)", chartLabel: "Optimal recovery" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: 40, label: "40", color: Z.lineR },
          { value: 65, label: "65", color: Z.lineG },
        ] satisfies ZoneLine[],
        data: recoveryData,
      },

      // ── VO2max ──────────────────────────────────────────────────────────
      {
        label: "VO₂max",
        unit: "ml/kg/min", color: "#10b981", decimals: 1, higherIsBetter: true,
        data: forwardFill(dailyRows.map(r => ({ date: r.date, value: r.vo2max_running ?? r.vo2max_cycling ?? null }))),
      },

      // ── HRV — personal baseline ─────────────────────────────────────────
      {
        label: "HRV (overnight)",
        unit: "ms", color: "#fbbf24", decimals: 0, higherIsBetter: true,
        zoneBands: hrvMean != null && hrvStd != null ? [
          { min: -Infinity,            max: hrvMean - hrvStd * 2, fill: Z.red,     severity: "danger",  label: "Suppressed (>2 SD below)", chartLabel: "Suppressed" },
          { min: hrvMean - hrvStd * 2, max: hrvMean - hrvStd,     fill: Z.amber,   severity: "warning", label: "Low (1–2 SD below)",       chartLabel: "Low" },
          { min: hrvMean - hrvStd,     max: hrvMean + hrvStd,      fill: Z.green,  severity: "optimal", label: `Baseline ±1 SD (${hrvMean.toFixed(0)} ms)`, chartLabel: "Baseline" },
          { min: hrvMean + hrvStd,     max: Infinity,              fill: Z.neutral, severity: "neutral", label: "Elevated (>1 SD above)",   chartLabel: "Elevated" },
        ] satisfies ZoneBand[] : [],
        zoneLines: hrvMean != null && hrvStd != null ? [
          { value: hrvMean,          label: `Baseline ${hrvMean.toFixed(0)} ms`, color: Z.lineG },
          { value: hrvMean - hrvStd, label: "−1 SD",                              color: Z.lineA },
        ] satisfies ZoneLine[] : [],
        data: dailyRows.map(r => ({ date: r.date, value: r.hrv_overnight ?? null })),
      },

      // ── Sleep ────────────────────────────────────────────────────────────
      {
        label: "Sleep Score",
        unit: "/100", color: "#a78bfa", decimals: 0, higherIsBetter: true,
        zoneBands: [
          { min: -Infinity, max: 50,  fill: Z.red,   severity: "danger",  label: "Poor (<50)",   chartLabel: "Poor" },
          { min: 50,        max: 70,  fill: Z.amber, severity: "warning", label: "Fair (50–70)", chartLabel: "Fair" },
          { min: 70, max: Infinity,   fill: Z.green, severity: "optimal", label: "Good (>70)",   chartLabel: "Good" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: 50, label: "50", color: Z.lineR },
          { value: 70, label: "70", color: Z.lineG },
        ] satisfies ZoneLine[],
        data: dailyRows.map(r => ({ date: r.date, value: r.sleep_score ?? null })),
      },
      {
        label: "Sleep Hours",
        unit: "h", color: "#818cf8", decimals: 1, higherIsBetter: true,
        zoneBands: [
          { min: -Infinity, max: 6, fill: Z.red,     severity: "danger",  label: "Too little (<6 h)",  chartLabel: "Too little" },
          { min: 6,         max: 7, fill: Z.amber,   severity: "warning", label: "Marginal (6–7 h)",   chartLabel: "Marginal" },
          { min: 7,         max: 9, fill: Z.green,   severity: "optimal", label: "Optimal (7–9 h)",    chartLabel: "Optimal" },
          { min: 9, max: Infinity,  fill: Z.neutral, severity: "neutral", label: "Long (>9 h)",         chartLabel: "Long" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: 6, label: "6 h", color: Z.lineR },
          { value: 7, label: "7 h", color: Z.lineG },
          { value: 9, label: "9 h", color: Z.lineA },
        ] satisfies ZoneLine[],
        data: dailyRows.map(r => ({ date: r.date, value: r.sleep_hours ?? null })),
      },

      // ── Physiological signals ────────────────────────────────────────────
      {
        label: "Resting Heart Rate",
        unit: "bpm", color: "var(--red)", decimals: 0, higherIsBetter: false,
        zoneBands: [
          { min: -Infinity, max: 50,  fill: Z.green,   severity: "optimal", label: "Excellent (<50)",   chartLabel: "Excellent" },
          { min: 50,        max: 60,  fill: Z.neutral, severity: "neutral", label: "Good (50–60)",      chartLabel: "Good" },
          { min: 60,        max: 70,  fill: Z.amber,   severity: "warning", label: "Moderate (60–70)",  chartLabel: "Moderate" },
          { min: 70, max: Infinity,   fill: Z.red,     severity: "danger",  label: "Elevated (>70)",    chartLabel: "Elevated" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: 50, label: "50", color: Z.lineG },
          { value: 60, label: "60", color: Z.lineA },
          { value: 70, label: "70", color: Z.lineR },
        ] satisfies ZoneLine[],
        data: dailyRows.map(r => ({ date: r.date, value: r.rhr ?? null })),
      },
      {
        label: "Body Battery (EOD)",
        unit: "%", color: "#34d399", decimals: 0, higherIsBetter: true,
        zoneBands: [
          { min: -Infinity, max: 25,  fill: Z.red,   severity: "danger",  label: "Depleted (<25)", chartLabel: "Depleted" },
          { min: 25,        max: 50,  fill: Z.amber, severity: "warning", label: "Low (25–50)",    chartLabel: "Low" },
          { min: 50, max: Infinity,   fill: Z.green, severity: "optimal", label: "Good (>50)",     chartLabel: "Good" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: 25, label: "25%", color: Z.lineR },
          { value: 50, label: "50%", color: Z.lineG },
        ] satisfies ZoneLine[],
        data: dailyRows.map(r => ({ date: r.date, value: r.body_battery ?? null })),
      },
      {
        label: "Daily Stress",
        unit: "", color: "#fb923c", decimals: 0, higherIsBetter: false,
        zoneBands: [
          { min: -Infinity, max: 25,  fill: Z.green, severity: "optimal", label: "Low (<25)",      chartLabel: "Low" },
          { min: 25,        max: 50,  fill: Z.amber, severity: "warning", label: "Moderate (25–50)", chartLabel: "Moderate" },
          { min: 50, max: Infinity,   fill: Z.red,   severity: "danger",  label: "High (>50)",     chartLabel: "High stress" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: 25, label: "25", color: Z.lineG },
          { value: 50, label: "50", color: Z.lineR },
        ] satisfies ZoneLine[],
        data: dailyRows.map(r => ({ date: r.date, value: r.stress_avg ?? null })),
      },

      // ── Load adaptation rate (bar chart) ────────────────────────────────
      {
        label: "Load Adaptation Rate",
        unit: "CTL/wk", color: "var(--green)", decimals: 1, chartType: "bar",
        zoneBands: [
          { min: -Infinity, max: -5,  fill: Z.amber, severity: "warning", label: "Detraining (<-5)",    chartLabel: "Detraining" },
          { min: -5,        max:  0,  fill: Z.neutral, severity: "neutral", label: "Recovery (-5–0)",   chartLabel: "Recovery" },
          { min:  0,        max:  7,  fill: Z.green, severity: "optimal", label: "Optimal build (0–7)", chartLabel: "Optimal build" },
          { min:  7,        max: 12,  fill: Z.amber, severity: "warning", label: "Caution (7–12)",      chartLabel: "Caution" },
          { min: 12, max: Infinity,   fill: Z.red,   severity: "danger",  label: "Injury risk (>12)",   chartLabel: "Injury risk" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value:  7, label: "7 — caution",      color: Z.lineA },
          { value: 12, label: "12 — injury risk",  color: Z.lineR },
        ] satisfies ZoneLine[],
        data: dailyRows.map(r => ({ date: r.date, value: r.ramp_7d ?? null })),
      },

      // ── Body weight ──────────────────────────────────────────────────────
      {
        label: "Body Weight",
        unit: "kg", color: "var(--dim)", decimals: 1,
        data: dailyRows.map(r => ({ date: r.date, value: r.weight_kg ?? null })),
      },

      // ── Calories burned (Garmin measured daily expenditure) ─────────────
      {
        label: "Calories Burned",
        unit: "kcal", color: "#fb7185", decimals: 0, chartType: "bar",
        data: dailyRows.map(r => ({ date: r.date, value: r.total_calories ?? null })),
      },
    ];
  } else {
    // Fallback from analyses.kpis snapshots (limited zone support)
    trendSeries = [
      {
        label: "Fitness (CTL)",
        unit: "load",
        color: "var(--accent)",
        decimals: 1,
        higherIsBetter: true,
        data: fallbackRows.map(r => ({ date: r.report_date, value: r.kpis?.training_load?.chronic_28d_avg ?? null })),
      },
      {
        label: "Form (TSB)",
        unit: "",
        color: "var(--accent)",
        decimals: 1,
        zoneBands: [
          { min: -Infinity, max: -30, fill: Z.red,     severity: "danger",  label: "Overreaching" },
          { min: -30,       max: -10, fill: Z.amber,   severity: "warning", label: "Training load" },
          { min: -10,       max: 5,   fill: Z.green,   severity: "optimal", label: "Race-ready" },
          { min: 5,         max: Infinity, fill: Z.neutral, severity: "neutral", label: "Fresh" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: -30, label: "-30", color: Z.lineR },
          { value: -10, label: "-10", color: Z.lineG },
          { value:   0, label: "0",   color: "rgba(148,163,184,0.5)" },
        ] satisfies ZoneLine[],
        data: fallbackRows.map(r => ({ date: r.report_date, value: r.kpis?.training_load?.tsb ?? null })),
      },
      {
        label: "VO₂max",
        unit: "ml/kg/min",
        color: "#34d399",
        decimals: 1,
        higherIsBetter: true,
        data: fallbackRows.map(r => ({ date: r.report_date, value: r.kpis?.physiological?.vo2max_running ?? null })),
      },
      {
        label: "HRV",
        unit: "ms",
        color: "#fbbf24",
        decimals: 0,
        higherIsBetter: true,
        data: fallbackRows.map(r => ({ date: r.report_date, value: r.kpis?.hrv?.weekly_avg ?? null })),
      },
      {
        label: "Sleep Score",
        unit: "/100",
        color: "#a78bfa",
        decimals: 0,
        higherIsBetter: true,
        zoneBands: [
          { min: -Infinity, max: 50,  fill: Z.red,   severity: "danger",  label: "Poor" },
          { min: 50,        max: 70,  fill: Z.amber, severity: "warning", label: "Fair" },
          { min: 70,        max: Infinity, fill: Z.green, severity: "optimal", label: "Good" },
        ] satisfies ZoneBand[],
        zoneLines: [
          { value: 50, label: "50", color: Z.lineR },
          { value: 70, label: "70", color: Z.lineG },
        ] satisfies ZoneLine[],
        data: fallbackRows.map(r => ({ date: r.report_date, value: r.kpis?.sleep?.avg_score ?? null })),
      },
      {
        label: "Resting Heart Rate",
        unit: "bpm",
        color: "var(--red)",
        decimals: 0,
        higherIsBetter: false,
        data: fallbackRows.map(r => ({ date: r.report_date, value: r.kpis?.physiological?.rhr ?? null })),
      },
      {
        label: "Body Weight",
        unit: "kg",
        color: "var(--dim)",
        decimals: 1,
        data: fallbackRows.map(r => ({ date: r.report_date, value: r.kpis?.body?.weight_kg ?? null })),
      },
    ];
  }

  // ── Bench e1RM (Epley) + Garmin race-time predictions — long-term goal trends,
  // independent of which branch built the series above. Bench comes from `analyses`
  // (one point per check-in, no daily equivalent); race predictions come from
  // `daily_metrics` (migration 038) — Garmin recomputes those every single day, so
  // this gets up to 365 real points per distance instead of one per weekly check-in.
  // No manual "enough data" gate here — ProgressTabs already drops any series with
  // fewer than 3 non-null points (`activeSeries` filter), so duplicating that
  // threshold here would just be a second place for it to drift out of sync.
  trendSeries.push({
    label: "Bench e1RM (Epley)",
    unit: "kg", color: "#c084fc", decimals: 1, higherIsBetter: true,
    data: benchRows.map(r => ({ date: r.report_date, value: r.bench_e1rm_kg })),
  });
  trendSeries.push({
    label: "Predicted 5K",
    unit: "min", color: "#38bdf8", decimals: 1, higherIsBetter: false,
    data: dailyRows.map(r => ({ date: r.date, value: r.predicted_5k_secs != null ? r.predicted_5k_secs / 60 : null })),
  });
  trendSeries.push({
    label: "Predicted 10K",
    unit: "min", color: "#34d399", decimals: 1, higherIsBetter: false,
    data: dailyRows.map(r => ({ date: r.date, value: r.predicted_10k_secs != null ? r.predicted_10k_secs / 60 : null })),
  });
  trendSeries.push({
    label: "Predicted Half Marathon",
    unit: "min", color: "#f59e0b", decimals: 1, higherIsBetter: false,
    data: dailyRows.map(r => ({ date: r.date, value: r.predicted_half_marathon_secs != null ? r.predicted_half_marathon_secs / 60 : null })),
  });
  trendSeries.push({
    label: "Predicted Marathon",
    unit: "min", color: "#f87171", decimals: 1, higherIsBetter: false,
    data: dailyRows.map(r => ({ date: r.date, value: r.predicted_marathon_secs != null ? r.predicted_marathon_secs / 60 : null })),
  });

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Progress</h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Weekly reviews, long-term trends, and season analysis
          {!useDailyMetrics && dailyRows.length === 0 && (
            <span style={{ color: "var(--amber)", marginLeft: 8 }}>
              · Run <code style={{ fontFamily: "var(--mono)" }}>--sync-history</code> to load full Garmin history
            </span>
          )}
        </p>
      </div>

      <ProgressTabs
        weeklyReview={weeklyReview}
        trendSeries={trendSeries}
        analysisHtml={latest?.analysis_html ?? null}
        planningHtml={latest?.planning_html ?? null}
        latestAnalysisDate={latest?.report_date ?? null}
        events={events}
        completedActivities={completedActivities}
      />
    </div>
  );
}

function forwardFill(
  series: { date: string; value: number | null }[],
): { date: string; value: number | null }[] {
  let last: number | null = null;
  return series.map(p => {
    if (p.value !== null) last = p.value;
    return { date: p.date, value: last };
  });
}
