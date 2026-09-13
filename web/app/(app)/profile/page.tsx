import { createServerClient, getUserId } from "@/lib/supabase-server";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Plan } from "@/lib/types";
import { signOut } from "@/app/login/actions";
import { MaxHRInput } from "./MaxHRInput";
import { ThemeToggle } from "./ThemeToggle";
import { UnitsToggle } from "./UnitsToggle";
import { LanguageToggle } from "./LanguageToggle";
import { getAthleteProfile } from "@/app/actions/athlete-profile";
import { getAuthenticatedLanguage } from "@/lib/i18n/getServerLanguage";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n/language";
import Link from "next/link";

interface Zone {
  zone: string;
  nameKey: "recovery" | "aerobicBase" | "aerobicThreshold" | "lactateThreshold" | "vo2max";
  pct: string;
}

// Olympiatoppen 5-zone model (% of HRmax)
const ZONES: Zone[] = [
  { zone: "Z1", nameKey: "recovery",          pct: "< 72"   },
  { zone: "Z2", nameKey: "aerobicBase",       pct: "72–82"  },
  { zone: "Z3", nameKey: "aerobicThreshold",  pct: "82–87"  },
  { zone: "Z4", nameKey: "lactateThreshold",  pct: "87–92"  },
  { zone: "Z5", nameKey: "vo2max",            pct: "> 92"   },
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
  const language = await getAuthenticatedLanguage(uid);
  const t = dictionaries[language].profile;

  const authClient = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await authClient.auth.getUser();
  const email = user?.email ?? "—";
  const joinedAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(localeTag(language), { day: "numeric", month: "long", year: "numeric" })
    : null;

  const [planRes, garminHrRes, settingsRes, athleteProfile] = await Promise.all([
    sb.from("plans").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
    sb.from("analyses").select("max_heart_rate_bpm").eq("user_id", uid).not("max_heart_rate_bpm", "is", null).order("report_date", { ascending: false }).limit(1),
    sb.from("user_settings").select("max_heart_rate_bpm").eq("user_id", uid).limit(1),
    getAthleteProfile(),
  ]);

  const _plan: Plan | null = planRes.data?.[0] ?? null;
  const garminMaxHR: number | null = garminHrRes.data?.[0]?.max_heart_rate_bpm ?? null;
  const manualMaxHR: number | null = settingsRes.data?.[0]?.max_heart_rate_bpm ?? null;
  const effectiveMaxHR: number | null = manualMaxHR ?? garminMaxHR;

  const zones = ZONES;

  return (
    <div className="page">

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{t.title}</h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>{t.subtitle}</p>
      </div>

      {/* ── Account ── */}
      <section className="section" style={{ marginTop: 0 }}>
        <h2 className="section-title">{t.account.title}</h2>
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 20, alignItems: "start" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                {t.account.email}
              </div>
              <div style={{ fontSize: 14, color: "var(--text)" }}>{email}</div>
            </div>
            {joinedAt && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
                  {t.account.memberSince}
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>{joinedAt}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Training Stats ── */}
      <section className="section">
        <h2 className="section-title">{t.trainingStats.title}</h2>
        <MaxHRInput manualValue={manualMaxHR} garminEstimate={garminMaxHR} />
      </section>

      {/* ── Coaching Profile ── */}
      <section className="section">
        <h2 className="section-title">{t.coachingProfile.title}</h2>
        {athleteProfile?.setup_completed ? (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                  {t.coachingProfile.active}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {athleteProfile.primary_goal_detail
                    ? athleteProfile.primary_goal_detail.slice(0, 120) + (athleteProfile.primary_goal_detail.length > 120 ? "…" : "")
                    : t.coachingProfile.activeDefault}
                </div>
              </div>
              <Link href="/setup" className="btn-secondary" style={{ flexShrink: 0 }}>
                <i className="ti ti-pencil" style={{ marginRight: 6 }} />{t.coachingProfile.editProfile}
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
                {t.coachingProfile.notSetupTitle}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {t.coachingProfile.notSetupDesc}
              </div>
            </div>
            <Link href="/setup" className="btn-primary" style={{ flexShrink: 0 }}>
              <i className="ti ti-sparkles" style={{ marginRight: 8 }} />{t.coachingProfile.startSetup}
            </Link>
          </div>
        )}
      </section>

      {/* ── Intensity Zones ── */}
      <section className="section">
        <h2 className="section-title">{t.zones.title}</h2>
        <div className="card" style={{ padding: 0 }}>
          <table className="zone-table">
            <thead>
              <tr>
                <th className="zt-col-zone">{t.zones.zone}</th>
                <th>{t.zones.name}</th>
                <th className="zt-col-pct">{t.zones.pctMax}</th>
                {effectiveMaxHR && <th className="zt-col-bpm">{t.zones.bpmRange}</th>}
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
                  <td style={{ fontWeight: 600 }}>{t.zones.names[z.nameKey]}</td>
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
          {t.zones.footnote}
          {!effectiveMaxHR && t.zones.footnoteNoMaxHR}
        </p>
      </section>

      {/* ── Appearance ── */}
      <section className="section">
        <h2 className="section-title">{t.appearance.title}</h2>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{t.appearance.theme}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.appearance.description}</div>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* ── Units ── */}
      <section className="section">
        <h2 className="section-title">{t.units.title}</h2>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{t.units.measurementSystem}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {t.units.description}
            </div>
          </div>
          <UnitsToggle />
        </div>
      </section>

      {/* ── Language ── */}
      <section className="section">
        <h2 className="section-title">{t.language.title}</h2>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{t.language.label}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {t.language.description}
            </div>
          </div>
          <LanguageToggle />
        </div>
      </section>

      {/* ── Sign out ── */}
      <section className="section">
        <h2 className="section-title">{t.session.title}</h2>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{t.session.signOut}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.session.signOutDesc}</div>
          </div>
          <form action={signOut}>
            <button type="submit" className="btn-danger">
              <i className="ti ti-logout" style={{ marginRight: 8 }} />
              {t.session.signOut}
            </button>
          </form>
        </div>
      </section>

    </div>
  );
}
