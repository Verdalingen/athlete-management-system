import { createServerClient, getUserId } from "@/lib/supabase-server";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { formatShort } from "@/lib/dates";
import type { Plan } from "@/lib/types";
import { signOut } from "@/app/login/actions";
import { MaxHRInput } from "./MaxHRInput";
import { ThemeToggle } from "./ThemeToggle";
import { getAthleteProfile } from "@/app/actions/athlete-profile";
import Link from "next/link";

interface Zone {
  zone: string;
  name: string;
  pct: string;
}

// Olympiatoppen 5-zone model (% of HRmax)
const ZONES: Zone[] = [
  { zone: "Z1", name: "Recovery",           pct: "< 72"   },
  { zone: "Z2", name: "Aerobic base",       pct: "72–82"  },
  { zone: "Z3", name: "Aerobic threshold",  pct: "82–87"  },
  { zone: "Z4", name: "Lactate threshold",  pct: "87–92"  },
  { zone: "Z5", name: "VO₂max",             pct: "> 92"   },
];

const ZONE_COLOR: Record<string, string> = {
  Z1: "var(--dim)",
  Z2: "var(--cyan)",
  Z3: "var(--green)",
  Z4: "var(--amber)",
  Z5: "var(--red)",
};

function hrRange(pct: string, maxHR: number): string {
  const lt = pct.match(/^<\s*(\d+)/);
  if (lt) return `< ${Math.round(maxHR * parseInt(lt[1]) / 100)}`;
  const range = pct.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return `${Math.round(maxHR * parseInt(range[1]) / 100)} – ${Math.round(maxHR * parseInt(range[2]) / 100)}`;
  const gt = pct.match(/^>\s*(\d+)/);
  if (gt) return `> ${Math.round(maxHR * parseInt(gt[1]) / 100)}`;
  return "—";
}

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const sb = createServerClient();
  const uid = await getUserId();

  const authClient = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await authClient.auth.getUser();
  const email = user?.email ?? "—";
  const joinedAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const [planRes, garminHrRes, settingsRes, athleteProfile] = await Promise.all([
    sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
    sb.from("analyses").select("max_heart_rate_bpm").eq("user_id", uid).not("max_heart_rate_bpm", "is", null).order("report_date", { ascending: false }).limit(1),
    sb.from("user_settings").select("max_heart_rate_bpm").eq("user_id", uid).limit(1),
    getAthleteProfile(),
  ]);

  const plan: Plan | null = planRes.data?.[0] ?? null;
  const garminMaxHR: number | null = garminHrRes.data?.[0]?.max_heart_rate_bpm ?? null;
  const manualMaxHR: number | null = settingsRes.data?.[0]?.max_heart_rate_bpm ?? null;
  const effectiveMaxHR: number | null = manualMaxHR ?? garminMaxHR;

  const zones = ZONES;
  const planGenerated = plan
    ? new Date(plan.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="page">

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Profile</h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Account settings and training configuration</p>
      </div>

      {/* ── Account ── */}
      <section className="section" style={{ marginTop: 0 }}>
        <h2 className="section-title">Account</h2>
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 20, alignItems: "start" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                Email
              </div>
              <div style={{ fontSize: 14, color: "var(--text)" }}>{email}</div>
            </div>
            {joinedAt && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                  Member since
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>{joinedAt}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Training Stats ── */}
      <section className="section">
        <h2 className="section-title">Training Stats</h2>
        <MaxHRInput manualValue={manualMaxHR} garminEstimate={garminMaxHR} />
      </section>

      {/* ── Coaching Profile ── */}
      <section className="section">
        <h2 className="section-title">Coaching Profile</h2>
        {athleteProfile?.setup_completed ? (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                  Coaching context is active
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {athleteProfile.primary_goal_detail
                    ? athleteProfile.primary_goal_detail.slice(0, 120) + (athleteProfile.primary_goal_detail.length > 120 ? "…" : "")
                    : "Your AI coach has a full briefing on your goals and preferences."}
                </div>
              </div>
              <Link href="/setup" className="btn-secondary" style={{ flexShrink: 0 }}>
                <i className="ti ti-pencil" style={{ marginRight: 6 }} />Edit profile
              </Link>
            </div>
            {athleteProfile.available_days?.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {athleteProfile.available_days.map(d => (
                  <span key={d} style={{ background: "rgba(124,92,255,.12)", color: "var(--accent)", borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                Set up your coaching profile
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                Tell your AI coach about your goals, background, and preferences to unlock personalised plans.
              </div>
            </div>
            <Link href="/setup" className="btn-primary" style={{ flexShrink: 0 }}>
              <i className="ti ti-sparkles" style={{ marginRight: 8 }} />Start setup
            </Link>
          </div>
        )}
      </section>

      {/* ── Intensity Zones ── */}
      <section className="section">
        <h2 className="section-title">Intensity Zones</h2>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 64 }}>Zone</th>
                <th>Name</th>
                <th style={{ width: 110 }}>% HR max</th>
                {effectiveMaxHR && <th style={{ width: 130 }}>BPM range</th>}
              </tr>
            </thead>
            <tbody>
              {zones.map((z, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: ZONE_COLOR[z.zone] ?? "var(--dim)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: ZONE_COLOR[z.zone] ?? "var(--dim)" }}>
                        {z.zone}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{z.name}</td>
                  <td style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12 }}>{z.pct}%</td>
                  {effectiveMaxHR && (
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: ZONE_COLOR[z.zone] ?? "var(--dim)" }}>
                      {hrRange(z.pct, effectiveMaxHR)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
          Olympiatoppen 5-zone model
          {!effectiveMaxHR && " · Set your max HR above to see BPM ranges"}
        </p>
      </section>

      {/* ── Appearance ── */}
      <section className="section">
        <h2 className="section-title">Appearance</h2>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>Theme</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Applies immediately and remembers your choice on this device.</div>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* ── Sign out ── */}
      <section className="section">
        <h2 className="section-title">Session</h2>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>Sign out</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>You&apos;ll be returned to the login screen.</div>
          </div>
          <form action={signOut}>
            <button type="submit" className="btn-danger">
              <i className="ti ti-logout" style={{ marginRight: 8 }} />
              Sign out
            </button>
          </form>
        </div>
      </section>

    </div>
  );
}
