import { createServerClient, getUserId } from "@/lib/supabase-server";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { formatShort } from "@/lib/dates";
import type { Plan } from "@/lib/types";
import { signOut } from "@/app/login/actions";
import { MaxHRInput } from "./MaxHRInput";

interface Zone {
  zone: string;
  name: string;
  pct: string;
}

function parseZones(md: string): Zone[] {
  const block = md.match(/##\s+Intensity Zones\n\n([\s\S]+?)(?:\n---|\n##)/);
  if (!block) return [];
  const rows = block[1].split("\n").filter(l => l.startsWith("|") && !l.includes("---") && !l.includes("Zone"));
  return rows.map(row => {
    const cols = row.split("|").map(s => s.trim()).filter(Boolean);
    return { zone: cols[0], name: cols[1], pct: cols[2] };
  }).filter(z => z.zone && z.name);
}

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

  const [planRes, garminHrRes, settingsRes] = await Promise.all([
    sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
    sb.from("analyses").select("max_heart_rate_bpm").eq("user_id", uid).not("max_heart_rate_bpm", "is", null).order("report_date", { ascending: false }).limit(1),
    sb.from("user_settings").select("max_heart_rate_bpm").eq("user_id", uid).limit(1),
  ]);

  const plan: Plan | null = planRes.data?.[0] ?? null;
  const garminMaxHR: number | null = garminHrRes.data?.[0]?.max_heart_rate_bpm ?? null;
  const manualMaxHR: number | null = settingsRes.data?.[0]?.max_heart_rate_bpm ?? null;
  const effectiveMaxHR: number | null = manualMaxHR ?? garminMaxHR;

  const zones = plan ? parseZones(plan.markdown) : [];
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

      {/* ── Intensity Zones ── */}
      <section className="section">
        <h2 className="section-title">Intensity Zones</h2>
        {zones.length > 0 ? (
          <>
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
                      <td style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12 }}>{z.pct}</td>
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
              Calibrated by your AI coach
              {planGenerated ? ` · Generated ${planGenerated}` : ""}
              {plan ? ` · ${formatShort(plan.start_date)} – ${formatShort(plan.end_date)}` : ""}
              {!effectiveMaxHR && " · Set your max HR above to see BPM ranges"}
            </p>
          </>
        ) : (
          <div className="card" style={{ textAlign: "center", padding: "32px 20px", color: "var(--muted)" }}>
            No zones found. Zones are defined when a training plan is generated.
          </div>
        )}
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
