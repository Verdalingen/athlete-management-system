// DEV ONLY — delete this file before shipping
import { SetupWizard } from "../SetupWizard";

const MOCK_PROFILE = {
  primary_goal_type: "hybrid",
  primary_goal_detail: "Sub-10 min 3000m and 140kg bench press by end of 2026",
  secondary_goals: "Build balanced upper-body aesthetics",
  goal_timeline: "End of 2026",
  events: [],
  training_years_strength: "3-5",
  training_years_cardio: "1-2",
  sport_background: "Bodybuilding background, started running 18 months ago.",
  sessions_per_week: 4,
  hours_per_week: 6,
  bench_1rm_kg: 115,
  squat_1rm_kg: 140,
  deadlift_1rm_kg: 170,
  run_5k_time: "23:00",
  run_10k_time: "50:00",
  other_benchmarks: "",
  available_days: ["monday", "tuesday", "thursday", "friday"],
  session_duration_mins: 90,
  gym_access: true,
  equipment_notes: "",
  schedule_notes: "",
  current_injuries: "",
  injury_history: "Minor left shoulder impingement 2023, fully resolved.",
  exercises_to_avoid: "",
  health_notes: "",
  preferred_style: "balanced",
  training_enjoyments: "Heavy compound lifts, tempo runs in the morning.",
  training_dislikes: "Long steady-state cardio above 60 min.",
  indoor_outdoor: "outdoor_pref",
  additional_notes: "I respond well to clear structure and numbers.",
  generated_analysis_context: `ATHLETE PROFILE — HYBRID (STRENGTH + ENDURANCE)
Adrian, 26. Goal: sub-10 min 3000m and 140kg bench press by end of 2026.
Training age: 3-5 years strength, 1-2 years running. Currently 4 sessions/week.
Bench 1RM: 115kg. 5k: 23:00. Strong foundation, clear dual-modality targets.`,
  generated_planning_context: `PLANNING CONSTRAINTS
Available days: Mon, Tue, Thu, Fri (4 sessions). Session cap: 90 min.
Gym access: yes. Cardio preference: outdoor first, indoor fallback.
No current injuries. Session volume is a baseline — coach may expand with readiness.`,
  setup_completed: true,
};

export default function DevPreviewPage() {
  if (process.env.NODE_ENV !== "development") return <div>Not found</div>;
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "var(--red, #ef4444)", textTransform: "uppercase" }}>
        Dev preview — not visible in production
      </div>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, marginBottom: 6 }}>Coaching setup</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
          Help your AI coach understand who you are and what you&apos;re trying to achieve.
        </p>
      </div>
      <SetupWizard initial={MOCK_PROFILE} />
    </main>
  );
}
