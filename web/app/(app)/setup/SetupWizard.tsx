"use client";

import { useState, useTransition } from "react";
import { saveProfileStep } from "@/app/actions/athlete-profile";
import type { AthleteProfile } from "@/app/actions/athlete-profile";
import { storeGarminCredentials, deleteGarminCredentials } from "@/app/actions/garmin-credentials";

// ── Types ─────────────────────────────────────────────────────────────────────

type Event = { name: string; date: string; priority: string; target_time: string };

const EMPTY: AthleteProfile = {
  primary_goal_type: "", primary_goal_detail: "", secondary_goals: "",
  goal_timeline: "", events: [],
  training_years_strength: "", training_years_cardio: "", sport_background: "",
  sessions_per_week: null, hours_per_week: null,
  bench_1rm_kg: null, squat_1rm_kg: null, deadlift_1rm_kg: null,
  run_5k_time: "", run_10k_time: "", other_benchmarks: "",
  available_days: [], session_duration_mins: null, gym_access: null,
  equipment_notes: "", schedule_notes: "",
  current_injuries: "", injury_history: "", exercises_to_avoid: "", health_notes: "",
  preferred_style: "", training_enjoyments: "", training_dislikes: "",
  indoor_outdoor: "", additional_notes: "",
  generated_analysis_context: "", generated_planning_context: "",
  setup_completed: false,
};

const DAYS    = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_VALS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const STEP_LABELS = ["Goals", "Background", "Schedule", "Health", "Preferences", "Garmin"];
const STEP_ICONS  = ["ti-target", "ti-barbell", "ti-calendar", "ti-heart-rate-monitor", "ti-adjustments", "ti-device-watch"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div className="field-label">{children}</div>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <div className="field-hint">{children}</div>;
}
function Field({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="field" style={style}>{children}</div>;
}
function Opt() {
  return <span style={{ color: "var(--dim)", fontWeight: 400, textTransform: "none", fontSize: 11, letterSpacing: 0 }}> (optional)</span>;
}
function RadioGroup({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string; desc?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field>
      <Label>{label}</Label>
      <div className="radio-group">
        {options.map(o => (
          <label key={o.value} className={`radio-opt${value === o.value ? " selected" : ""}`}>
            <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} style={{ marginTop: 3 }} />
            <div>
              <div className="radio-opt-label">{o.label}</div>
              {o.desc && <div className="radio-opt-desc">{o.desc}</div>}
            </div>
          </label>
        ))}
      </div>
    </Field>
  );
}
function numVal(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// Goal-type helpers — empty string = no selection yet → show everything
function isCardioRelevant(g: string) { return !g || g === "race" || g === "hybrid" || g === "fitness"; }
function isStrengthRelevant(g: string) { return !g || g === "strength" || g === "aesthetics" || g === "hybrid" || g === "fitness"; }
function hasRaceEvents(g: string) { return !g || g === "race" || g === "hybrid"; }

const GOAL_TARGET_PLACEHOLDER: Record<string, string> = {
  race:       "e.g. Sub-45 min 10k and qualify for the city marathon in spring 2027",
  strength:   "e.g. 140kg bench press and 200kg deadlift within 12 months",
  aesthetics: "e.g. Gain 10kg of lean muscle, visible definition, balanced upper body by summer",
  hybrid:     "e.g. Sub-10 min 3000m and 140kg bench press by end of 2026",
  fitness:    "e.g. Run a 5k without stopping, complete 20 push-ups, feel healthier overall",
  "":         "e.g. Sub-10 min 3000m and 140kg bench press by end of 2026",
};

// ── Wizard steps ───────────────────────────────────────────────────────────────

function GoalsStep({ data, set }: { data: AthleteProfile; set: (p: Partial<AthleteProfile>) => void }) {
  function addEvent() { set({ events: [...data.events, { name: "", date: "", priority: "B", target_time: "" }] }); }
  function updateEvent(i: number, k: keyof Event, v: string) {
    set({ events: data.events.map((e, j) => j === i ? { ...e, [k]: v } : e) });
  }
  function removeEvent(i: number) { set({ events: data.events.filter((_, j) => j !== i) }); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <RadioGroup label="Primary goal" value={data.primary_goal_type} onChange={v => set({ primary_goal_type: v })}
        options={[
          { value: "race",       label: "Race performance",  desc: "Training oriented around a specific event — running, triathlon, etc." },
          { value: "strength",   label: "Strength",          desc: "Maximising a specific lift or overall strength output." },
          { value: "aesthetics", label: "Aesthetics",        desc: "Body composition, muscle growth, or physique goals." },
          { value: "hybrid",     label: "Hybrid athlete",    desc: "Pursuing strength and endurance concurrently." },
          { value: "fitness",    label: "General fitness",   desc: "Health, conditioning, and longevity without a specific target." },
        ]}
      />
      <Field>
        <Label>Describe your specific target</Label>
        <Hint>Be as precise as possible — exact times, weights, distances, or milestones.</Hint>
        <textarea className="textarea" style={{ minHeight: 72 }}
          placeholder={GOAL_TARGET_PLACEHOLDER[data.primary_goal_type] ?? GOAL_TARGET_PLACEHOLDER[""]}
          value={data.primary_goal_detail} onChange={e => set({ primary_goal_detail: e.target.value })} />
      </Field>
      <Field>
        <Label>Secondary goals<Opt /></Label>
        <textarea className="textarea" style={{ minHeight: 60 }}
          placeholder="e.g. Build a balanced upper-body physique alongside the primary goals"
          value={data.secondary_goals} onChange={e => set({ secondary_goals: e.target.value })} />
      </Field>
      <Field>
        <Label>Target timeline</Label>
        <input className="input" placeholder="e.g. By end of 2026, within 6 months, before summer"
          value={data.goal_timeline} onChange={e => set({ goal_timeline: e.target.value })} />
      </Field>
      {hasRaceEvents(data.primary_goal_type) && (
        <Field>
          <Label>Races or key events<Opt /></Label>
          {data.events.map((ev, i) => (
            <div key={i} className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Event {i + 1}</span>
                <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => removeEvent(i)}>Remove</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field><Label>Name</Label><input className="input" placeholder="e.g. Oslo Marathon" value={ev.name} onChange={e => updateEvent(i, "name", e.target.value)} /></Field>
                <Field><Label>Date</Label><input className="input" type="date" value={ev.date} onChange={e => updateEvent(i, "date", e.target.value)} /></Field>
                <Field>
                  <Label>Priority</Label>
                  <select className="select-input" value={ev.priority} onChange={e => updateEvent(i, "priority", e.target.value)}>
                    <option value="A">A — Peak for this</option>
                    <option value="B">B — Tune-up / secondary</option>
                    <option value="C">C — Just participating</option>
                  </select>
                </Field>
                <Field><Label>Target time<Opt /></Label><input className="input" placeholder="e.g. sub 3:30" value={ev.target_time} onChange={e => updateEvent(i, "target_time", e.target.value)} /></Field>
              </div>
            </div>
          ))}
          <button type="button" className="btn-secondary" style={{ alignSelf: "flex-start" }} onClick={addEvent}>
            <i className="ti ti-plus" style={{ marginRight: 6 }} />Add event
          </button>
        </Field>
      )}
    </div>
  );
}

function BackgroundStep({ data, set }: { data: AthleteProfile; set: (p: Partial<AthleteProfile>) => void }) {
  const yearOpts = [
    { value: "none", label: "No experience" }, { value: "<1", label: "Less than 1 year" },
    { value: "1-2",  label: "1–2 years" },     { value: "3-5", label: "3–5 years" },
    { value: "5-10", label: "5–10 years" },    { value: "10+", label: "10+ years" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field>
          <Label>Strength training experience</Label>
          <select className="select-input" value={data.training_years_strength} onChange={e => set({ training_years_strength: e.target.value })}>
            <option value="">Select…</option>
            {yearOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field>
          <Label>Running / cardio experience</Label>
          <select className="select-input" value={data.training_years_cardio} onChange={e => set({ training_years_cardio: e.target.value })}>
            <option value="">Select…</option>
            {yearOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>
      <Field>
        <Label>Sport & training background</Label>
        <Hint>Any sports played, training styles you come from, notable history.</Hint>
        <textarea className="textarea"
          placeholder="e.g. Bodybuilding background for 4 years, started running 18 months ago."
          value={data.sport_background} onChange={e => set({ sport_background: e.target.value })} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field>
          <Label>Current weekly sessions</Label>
          <Hint>Baseline today — not a cap on future volume.</Hint>
          <input className="input" type="number" min={0} max={14} placeholder="e.g. 4"
            value={data.sessions_per_week ?? ""} onChange={e => set({ sessions_per_week: numVal(e.target.value) })} />
        </Field>
        <Field>
          <Label>Current weekly hours</Label>
          <Hint>Approximate total training time right now.</Hint>
          <input className="input" type="number" min={0} max={30} step={0.5} placeholder="e.g. 6"
            value={data.hours_per_week ?? ""} onChange={e => set({ hours_per_week: numVal(e.target.value) })} />
        </Field>
      </div>
      {(isStrengthRelevant(data.primary_goal_type) || isCardioRelevant(data.primary_goal_type)) && (
        <div>
          <Label>Current performance benchmarks</Label>
          <Hint>Fill in what&apos;s relevant — leave blank what doesn&apos;t apply.</Hint>
          {isStrengthRelevant(data.primary_goal_type) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 8 }}>
              {([["Bench 1RM (kg)", "bench_1rm_kg", "e.g. 125"], ["Squat 1RM (kg)", "squat_1rm_kg", "e.g. 140"], ["Deadlift 1RM (kg)", "deadlift_1rm_kg", "e.g. 180"]] as const).map(([label, key, ph]) => (
                <Field key={key}>
                  <Label>{label}</Label>
                  <input className="input" type="number" placeholder={ph}
                    value={data[key] ?? ""} onChange={e => set({ [key]: numVal(e.target.value) })} />
                </Field>
              ))}
            </div>
          )}
          {isCardioRelevant(data.primary_goal_type) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <Field><Label>5k time</Label><input className="input" placeholder="e.g. 23:45" value={data.run_5k_time} onChange={e => set({ run_5k_time: e.target.value })} /></Field>
              <Field><Label>10k time</Label><input className="input" placeholder="e.g. 50:10" value={data.run_10k_time} onChange={e => set({ run_10k_time: e.target.value })} /></Field>
            </div>
          )}
        </div>
      )}
      <Field>
        <Label>Other benchmarks<Opt /></Label>
        <textarea className="textarea" style={{ minHeight: 60 }}
          placeholder="e.g. 10 pull-ups, 100kg OHP, swimming 1500m in 28 min"
          value={data.other_benchmarks} onChange={e => set({ other_benchmarks: e.target.value })} />
      </Field>
    </div>
  );
}

function ScheduleStep({ data, set }: { data: AthleteProfile; set: (p: Partial<AthleteProfile>) => void }) {
  function toggleDay(val: string) {
    set({ available_days: data.available_days.includes(val) ? data.available_days.filter(d => d !== val) : [...data.available_days, val] });
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Field>
        <Label>Available training days</Label>
        <Hint>Select every day you could realistically train — the coach will decide which to use.</Hint>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {DAYS.map((d, i) => (
            <button key={d} type="button"
              className={`day-btn${data.available_days.includes(DAY_VALS[i]) ? " selected" : ""}`}
              onClick={() => toggleDay(DAY_VALS[i])}>{d}</button>
          ))}
        </div>
      </Field>
      <RadioGroup label="Session length" value={String(data.session_duration_mins ?? "")} onChange={v => set({ session_duration_mins: parseInt(v) })}
        options={[
          { value: "45",  label: "Up to 45 minutes",         desc: "Quick sessions — supersets or minimal rest required." },
          { value: "60",  label: "Up to 60 minutes",         desc: "Standard session length with structured rest." },
          { value: "90",  label: "Up to 90 minutes",         desc: "Full sessions with proper warm-up and cool-down." },
          { value: "120", label: "No limit — coach decides", desc: "No time constraint. The coach determines optimal session length." },
        ]}
      />
      <RadioGroup label="Gym access" value={data.gym_access === null ? "" : data.gym_access ? "yes" : "no"} onChange={v => set({ gym_access: v === "yes" })}
        options={[
          { value: "yes", label: "Yes — full gym",            desc: "Access to barbells, cables, machines, cardio equipment." },
          { value: "no",  label: "No — home or outdoor only", desc: "Training with limited or bodyweight equipment." },
        ]}
      />
      <Field>
        <Label>Equipment notes<Opt /></Label>
        <Hint>Any specific equipment available or missing.</Hint>
        <textarea className="textarea" style={{ minHeight: 60 }}
          placeholder="e.g. Full commercial gym — cables, dumbbells up to 60kg, all barbells, no sled."
          value={data.equipment_notes} onChange={e => set({ equipment_notes: e.target.value })} />
      </Field>
      <Field>
        <Label>Schedule constraints<Opt /></Label>
        <Hint>Work hours, commute, travel, family — anything that limits flexibility.</Hint>
        <textarea className="textarea" style={{ minHeight: 60 }}
          placeholder="e.g. Office 8-17 Mon-Fri, can train before work (06:00) or evenings."
          value={data.schedule_notes} onChange={e => set({ schedule_notes: e.target.value })} />
      </Field>
    </div>
  );
}

function HealthStep({ data, set }: { data: AthleteProfile; set: (p: Partial<AthleteProfile>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="card" style={{ borderLeft: "3px solid var(--amber)", padding: "12px 16px" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          This information stays private and is only used to personalise your training plan. Leave any field blank if it&apos;s not relevant to you.
        </div>
      </div>
      <Field>
        <Label>Current injuries or pain</Label>
        <Hint>Anything affecting training right now — even if minor.</Hint>
        <textarea className="textarea"
          placeholder="e.g. Mild left shoulder impingement — overhead pressing causes discomfort above 90°."
          value={data.current_injuries} onChange={e => set({ current_injuries: e.target.value })} />
      </Field>
      <Field>
        <Label>Injury history</Label>
        <Hint>Past injuries still relevant to movement or with recurrence risk. Leave blank if none.</Hint>
        <textarea className="textarea"
          placeholder="e.g. Right knee meniscus tear in 2022, fully recovered."
          value={data.injury_history} onChange={e => set({ injury_history: e.target.value })} />
      </Field>
      <Field>
        <Label>Exercises to avoid</Label>
        <Hint>Movements you can&apos;t do, won&apos;t do, or have been told to avoid. Leave blank if none.</Hint>
        <textarea className="textarea" style={{ minHeight: 60 }}
          placeholder="e.g. No behind-the-neck press, no leg press, no upright rows."
          value={data.exercises_to_avoid} onChange={e => set({ exercises_to_avoid: e.target.value })} />
      </Field>
      <Field>
        <Label>Other health notes<Opt /></Label>
        <Hint>Medical conditions, medications, sleep issues, or anything else the coach should factor in.</Hint>
        <textarea className="textarea" style={{ minHeight: 60 }}
          placeholder="e.g. Mild sleep apnea — recovery is slower than average."
          value={data.health_notes} onChange={e => set({ health_notes: e.target.value })} />
      </Field>
    </div>
  );
}

function PreferencesStep({ data, set }: { data: AthleteProfile; set: (p: Partial<AthleteProfile>) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <RadioGroup label="Training style preference" value={data.preferred_style} onChange={v => set({ preferred_style: v })}
        options={[
          { value: "high_freq", label: "High frequency, moderate volume",   desc: "5-7 sessions per week, moderate intensity each. Daily training with managed fatigue." },
          { value: "low_freq",  label: "Low frequency, high volume",        desc: "3-4 sessions per week, each long and demanding. Full recovery between sessions." },
          { value: "balanced",  label: "Balanced periodisation",            desc: "Structured variation in intensity and volume across the training week." },
          { value: "no_pref",   label: "No preference — coach decides",     desc: "Leave it entirely to the AI coach based on your goals and readiness." },
        ]}
      />
      {isCardioRelevant(data.primary_goal_type) && (
        <RadioGroup label="Cardio / running preference" value={data.indoor_outdoor} onChange={v => set({ indoor_outdoor: v })}
          options={[
            { value: "outdoor_pref", label: "Outdoor preferred",  desc: "Default to running or cycling outdoors — indoor as a fallback in bad weather." },
            { value: "outdoor_only", label: "Outdoor only",       desc: "Always outdoors. No treadmills or gym cardio machines." },
            { value: "indoor",       label: "Indoor preferred",   desc: "Prefer treadmill, rowing machine, or other gym cardio." },
            { value: "no_pref",      label: "No preference",      desc: "Whatever suits the session — coach decides." },
          ]}
        />
      )}
      <Field>
        <Label>What do you enjoy about training?</Label>
        <Hint>Types of sessions, movements, or feelings you genuinely look forward to.</Hint>
        <textarea className="textarea"
          placeholder="e.g. Heavy compound lifts, tempo runs in the morning, the burn of high-rep isolation work."
          value={data.training_enjoyments} onChange={e => set({ training_enjoyments: e.target.value })} />
      </Field>
      <Field>
        <Label>What do you dislike or want to minimise?</Label>
        <Hint>Training methods or session types the coach should avoid or keep rare.</Hint>
        <textarea className="textarea"
          placeholder="e.g. Long steady-state cardio above 60 min, circuit training."
          value={data.training_dislikes} onChange={e => set({ training_dislikes: e.target.value })} />
      </Field>
      <Field>
        <Label>Anything else your coach should know?<Opt /></Label>
        <Hint>Motivation style, how you handle hard training, life context.</Hint>
        <textarea className="textarea"
          placeholder="e.g. I respond well to clear structure and numbers. I tend to overtrain if left to my own devices."
          value={data.additional_notes} onChange={e => set({ additional_notes: e.target.value })} />
      </Field>
    </div>
  );
}

// ── Garmin Connect step ────────────────────────────────────────────────────────

function GarminConnectStep({ initialEmail }: { initialEmail?: string | null }) {
  const [connected, setConnected] = useState(!!initialEmail);
  const [connectedEmail, setConnectedEmail] = useState(initialEmail ?? "");
  const [showForm, setShowForm] = useState(!initialEmail);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "disconnecting" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function handleConnect() {
    if (!email || !password) return;
    setStatus("saving");
    setErrMsg("");
    const result = await storeGarminCredentials(email, password);
    if (result.error) { setStatus("error"); setErrMsg(result.error); return; }
    setConnected(true);
    setConnectedEmail(email);
    setShowForm(false);
    setPassword("");
    setStatus("done");
  }

  async function handleDisconnect() {
    setStatus("disconnecting");
    setErrMsg("");
    const result = await deleteGarminCredentials();
    if (result.error) { setStatus("error"); setErrMsg(result.error); return; }
    setConnected(false);
    setConnectedEmail("");
    setEmail("");
    setShowForm(true);
    setStatus("idle");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="card" style={{ borderLeft: "3px solid var(--accent)", padding: "12px 16px" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          Your Garmin Connect credentials are encrypted at rest using Supabase Vault (AES-256). They are used only to sync your training data and health metrics with the AI coach. You can disconnect at any time.
        </div>
      </div>

      {connected && !showForm ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green, #22c55e)" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Connected</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>— {connectedEmail}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-secondary" style={{ fontSize: 13 }}
              onClick={() => { setEmail(connectedEmail); setShowForm(true); setStatus("idle"); }}>
              <i className="ti ti-pencil" style={{ marginRight: 6 }} />Update credentials
            </button>
            <button type="button" className="btn-secondary" style={{ fontSize: 13, color: "var(--red, #ef4444)" }}
              onClick={handleDisconnect} disabled={status === "disconnecting"}>
              <i className="ti ti-unlink" style={{ marginRight: 6 }} />
              {status === "disconnecting" ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {connected && (
            <button type="button" className="btn-secondary" style={{ alignSelf: "flex-start", fontSize: 13 }}
              onClick={() => { setShowForm(false); setStatus("idle"); }}>
              <i className="ti ti-arrow-left" style={{ marginRight: 6 }} />Cancel
            </button>
          )}
          <Field>
            <Label>Garmin Connect email</Label>
            <input className="input" type="email" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Field>
            <Label>Garmin Connect password</Label>
            <input className="input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <button type="button" className="btn-primary" style={{ alignSelf: "flex-start" }}
            onClick={handleConnect} disabled={!email || !password || status === "saving"}>
            {status === "saving"
              ? <><i className="ti ti-loader-2" style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />Connecting…</>
              : <><i className="ti ti-link" style={{ marginRight: 6 }} />{connected ? "Update" : "Connect"}</>}
          </button>
        </div>
      )}

      {status === "error" && <div style={{ color: "var(--red, #ef4444)", fontSize: 13 }}>{errMsg}</div>}
      {status === "done" && <div style={{ color: "var(--green, #22c55e)", fontSize: 13 }}>Credentials saved successfully.</div>}

      <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
        No Garmin Connect account? You can skip this step and connect later from your profile settings.
      </div>
    </div>
  );
}

// ── Context preview (read-only) ────────────────────────────────────────────────

function ContextPreview({ label, text }: { label: string; text: string }) {
  const lines = text.trim().split("\n").filter(Boolean).slice(0, 3);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)" }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)", lineHeight: 1.6, borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
        {lines.map((l, i) => <div key={i}>{l}</div>)}
        {text.trim().split("\n").filter(Boolean).length > 3 && <div style={{ color: "var(--dim)", marginTop: 2 }}>…</div>}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SetupWizard({ initial, devProfileStale, garminEmail }: { initial: AthleteProfile | null; devProfileStale?: boolean; garminEmail?: string | null }) {
  const hasContext = !!(initial?.generated_analysis_context || initial?.generated_planning_context);

  const [mode, setMode] = useState<"review" | "wizard">(hasContext ? "review" : "wizard");
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(hasContext ? 6 : 1);
  const [data, setData] = useState<AthleteProfile>(initial ?? EMPTY);
  const [isDirty, setIsDirty] = useState(false);
  const [profileStale, setProfileStale] = useState(devProfileStale ?? false);
  const [showText, setShowText] = useState(false);
  const [saving, startSave] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(partial: Partial<AthleteProfile>) {
    setData(d => ({ ...d, ...partial }));
    setIsDirty(true);
  }

  function getStepPartial(s: number): Partial<AthleteProfile> {
    const keys: (keyof AthleteProfile)[][] = [
      ["primary_goal_type", "primary_goal_detail", "secondary_goals", "goal_timeline", "events"],
      ["training_years_strength", "training_years_cardio", "sport_background", "sessions_per_week", "hours_per_week", "bench_1rm_kg", "squat_1rm_kg", "deadlift_1rm_kg", "run_5k_time", "run_10k_time", "other_benchmarks"],
      ["available_days", "session_duration_mins", "gym_access", "equipment_notes", "schedule_notes"],
      ["current_injuries", "injury_history", "exercises_to_avoid", "health_notes"],
      ["preferred_style", "training_enjoyments", "training_dislikes", "indoor_outdoor", "additional_notes"],
    ];
    const partial: Partial<AthleteProfile> = {};
    for (const k of (keys[s - 1] ?? [])) {
      (partial as unknown as Record<string, unknown>)[k] = (data as unknown as Record<string, unknown>)[k];
    }
    return partial;
  }

  async function handleNext() {
    setError(null);
    if (step === 6) {
      setMode("review");
      if (isDirty && (data.generated_analysis_context || data.generated_planning_context)) setProfileStale(true);
      setIsDirty(false);
      return;
    }
    startSave(async () => {
      const result = await saveProfileStep(getStepPartial(step));
      if (result.error) { setError(result.error); return; }
      if (step === 5) {
        const next = 6;
        setStep(next);
        setMaxStep(m => Math.max(m, next));
      } else {
        const next = step + 1;
        setStep(next);
        setMaxStep(m => Math.max(m, next));
      }
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Generation failed");
      const { analysisContext, planningContext } = await res.json();
      const result = await saveProfileStep({
        generated_analysis_context: analysisContext,
        generated_planning_context: planningContext,
        setup_completed: true,
      });
      if (result.error) throw new Error(result.error);
      setData(d => ({ ...d, generated_analysis_context: analysisContext, generated_planning_context: planningContext, setup_completed: true }));
      setIsDirty(false);
      setProfileStale(false);
    } catch {
      setError("Failed to generate context. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveExit() {
    if (!isDirty) { setMode("review"); return; }
    setError(null);
    startSave(async () => {
      const result = await saveProfileStep(getStepPartial(step));
      if (result.error) { setError(result.error); return; }
      setIsDirty(false);
      if (data.generated_analysis_context || data.generated_planning_context) setProfileStale(true);
      setMode("review");
    });
  }

  async function handleSaveText() {
    setError(null);
    startSave(async () => {
      const result = await saveProfileStep({
        generated_analysis_context: data.generated_analysis_context,
        generated_planning_context: data.generated_planning_context,
      });
      if (result.error) { setError(result.error); return; }
      setIsDirty(false);
      setShowText(false);
    });
  }

  // ── Review mode (default) ──────────────────────────────────────────────────

  if (mode === "review") {
    const hasCtx = !!(data.generated_analysis_context || data.generated_planning_context);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Status */}
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          {hasCtx
            ? "Your coaching context has been generated from your profile answers."
            : "No coaching context yet. Fill in your profile answers and generate a brief for your AI coach."}
        </div>

        {/* Staleness warning */}
        {profileStale && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            background: "rgba(234,179,8,.08)", border: "1px solid rgba(234,179,8,.3)",
            borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "var(--yellow, #eab308)", lineHeight: 1.5,
          }}>
            <i className="ti ti-refresh-alert" style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }} />
            <span>Your profile answers have changed. <strong>Regenerate</strong> to update the coaching context.</span>
          </div>
        )}

        {/* Context preview */}
        {hasCtx && !showText && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16, background: "rgba(255,255,255,.03)" }}>
            <ContextPreview label="Analysis context"  text={data.generated_analysis_context} />
            <ContextPreview label="Planning context"  text={data.generated_planning_context} />
          </div>
        )}

        {/* Editable textareas */}
        {hasCtx && showText && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Field>
              <Label>Analysis context</Label>
              <Hint>Who you are and what you&apos;re trying to achieve — used for season-level planning.</Hint>
              <textarea className="textarea" style={{ minHeight: 240, fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.6 }}
                value={data.generated_analysis_context}
                onChange={e => { setData(d => ({ ...d, generated_analysis_context: e.target.value })); setIsDirty(true); }} />
            </Field>
            <Field>
              <Label>Planning context</Label>
              <Hint>Operational constraints — treated as non-negotiable by the session planner.</Hint>
              <textarea className="textarea" style={{ minHeight: 240, fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.6 }}
                value={data.generated_planning_context}
                onChange={e => { setData(d => ({ ...d, generated_planning_context: e.target.value })); setIsDirty(true); }} />
            </Field>
            {isDirty && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-primary" onClick={handleSaveText} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button className="btn-secondary" onClick={() => { setData(initial ?? EMPTY); setIsDirty(false); setShowText(false); }}>
                  Discard
                </button>
              </div>
            )}
          </div>
        )}

        {/* Garmin note */}
        <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
          When a plan is generated, your recent Garmin activity data is also fetched automatically — training load, workout history, and fitness trends — so the coach can determine appropriate phases and progression from your actual current state.
        </div>

        {/* Error */}
        {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
            {generating
              ? <><i className="ti ti-loader-2" style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />Generating…</>
              : <><i className="ti ti-sparkles" style={{ marginRight: 8 }} />{hasCtx ? "Regenerate" : "Generate coaching context"}</>}
          </button>
          <button className="btn-secondary" onClick={() => { setMode("wizard"); setStep(1); setIsDirty(false); }}>
            <i className="ti ti-list-details" style={{ marginRight: 6 }} />Edit profile answers
          </button>
          {hasCtx && (
            <button className="btn-secondary" onClick={() => setShowText(v => !v)}>
              <i className={`ti ${showText ? "ti-eye-off" : "ti-code"}`} style={{ marginRight: 6 }} />
              {showText ? "Hide text" : "Edit text"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Wizard mode ────────────────────────────────────────────────────────────

  const STEP_HEADINGS = [
    "What are you training for?",
    "Your athletic background",
    "Schedule & equipment",
    "Health & limitations",
    "Training preferences",
    "Connect Garmin",
  ];
  const STEP_SUBTITLES = [
    "Your goals are the foundation of every decision the coach makes.",
    "Help the coach understand where you are starting from.",
    "When and where you train shapes what's possible.",
    "Any limitations the coach should know about.",
    "A plan you'll actually stick to beats a perfect plan you hate.",
    "Sync your training data, health metrics, and performance trends.",
  ];

  return (
    <div>
      {/* Back to overview */}
      <button
        className="btn-secondary"
        style={{ marginBottom: 20, fontSize: 13 }}
        onClick={() => setMode("review")}
      >
        <i className="ti ti-arrow-left" style={{ marginRight: 6 }} />Back to overview
      </button>

      {/* Step progress */}
      <div className="wizard-steps" style={{ marginBottom: 28 }}>
        {STEP_LABELS.map((label, i) => {
          const num = i + 1;
          const done   = num < step;
          const active = num === step;
          const reachable = num <= maxStep;
          return (
            <div key={num} className="wizard-step">
              <div
                className={`step-dot${done ? " done" : active ? " active" : ""}`}
                style={{ cursor: reachable && !active ? "pointer" : undefined }}
                onClick={() => reachable && !active && setStep(num)}
                title={label}
              >
                {done ? <i className="ti ti-check" style={{ fontSize: 12 }} /> : num}
              </div>
              {i < STEP_LABELS.length - 1 && <div className={`step-line${done ? " done" : ""}`} />}
            </div>
          );
        })}
      </div>

      {/* Step header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <i className={`ti ${STEP_ICONS[step - 1]}`} style={{ fontSize: 18, color: "var(--accent)" }} />
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{STEP_HEADINGS[step - 1]}</h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>{STEP_SUBTITLES[step - 1]}</p>
      </div>

      {/* Step content */}
      <div className="card" style={{ marginBottom: 24 }}>
        {step === 1 && <GoalsStep          data={data} set={patch} />}
        {step === 2 && <BackgroundStep     data={data} set={patch} />}
        {step === 3 && <ScheduleStep       data={data} set={patch} />}
        {step === 4 && <HealthStep         data={data} set={patch} />}
        {step === 5 && <PreferencesStep    data={data} set={patch} />}
        {step === 6 && <GarminConnectStep  initialEmail={garminEmail} />}
      </div>

      {/* Error */}
      {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="btn-secondary" disabled={saving}
          onClick={() => step === 1 ? setMode("review") : setStep(s => s - 1)}>
          <i className="ti ti-arrow-left" style={{ marginRight: 6 }} />
          {step === 1 ? "Overview" : "Back"}
        </button>
        <span style={{ fontSize: 12, color: "var(--dim)" }}>Step {step} of 6</span>
        <div style={{ display: "flex", gap: 8 }}>
          {step < 6 && (
            <button className="btn-secondary" onClick={handleSaveExit} disabled={saving}>
              {saving ? "Saving…" : "Save & exit"}
            </button>
          )}
          <button className="btn-primary" onClick={handleNext} disabled={saving}>
            {saving ? "Saving…" : step === 6
              ? <>Finish <i className="ti ti-check" style={{ marginLeft: 6 }} /></>
              : step === 5
                ? <>Continue <i className="ti ti-arrow-right" style={{ marginLeft: 6 }} /></>
                : <>Continue <i className="ti ti-arrow-right" style={{ marginLeft: 6 }} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
