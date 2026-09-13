import { getAthleteProfile } from "@/app/actions/athlete-profile";
import { getGarminConnectionStatus } from "@/app/actions/garmin-credentials";
import { SetupWizard } from "./SetupWizard";
import Link from "next/link";
import { getUserId } from "@/lib/supabase-server";
import { getAuthenticatedLanguage } from "@/lib/i18n/getServerLanguage";
import { dictionaries } from "@/lib/i18n/dictionaries";

export async function generateMetadata() {
  const uid = await getUserId();
  const language = await getAuthenticatedLanguage(uid);
  return { title: dictionaries[language].setup.pageTitle };
}

export default async function SetupPage() {
  const uid = await getUserId();
  const language = await getAuthenticatedLanguage(uid);
  const t = dictionaries[language].setup;

  const [profile, garmin] = await Promise.all([
    getAthleteProfile(),
    getGarminConnectionStatus(),
  ]);

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px 80px" }}>
      <Link href="/profile" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)", textDecoration: "none", marginBottom: 32 }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 14 }} />{t.page.backToProfile}
      </Link>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, marginBottom: 6 }}>{t.page.heading}</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
          {t.page.description}
        </p>
      </div>
      <SetupWizard initial={profile} garminEmail={garmin.email} />
    </main>
  );
}
