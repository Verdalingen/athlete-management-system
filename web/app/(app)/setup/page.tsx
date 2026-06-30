import { getAthleteProfile } from "@/app/actions/athlete-profile";
import { getGarminConnectionStatus } from "@/app/actions/garmin-credentials";
import { SetupWizard } from "./SetupWizard";
import Link from "next/link";

export const metadata = { title: "Coaching Setup" };

export default async function SetupPage() {
  const [profile, garmin] = await Promise.all([
    getAthleteProfile(),
    getGarminConnectionStatus(),
  ]);

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px 80px" }}>
      <Link href="/profile" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)", textDecoration: "none", marginBottom: 32 }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 14 }} />Profile
      </Link>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, marginBottom: 6 }}>Coaching setup</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
          Help your AI coach understand who you are and what you&apos;re trying to achieve.
          This takes about 5 minutes and shapes every plan you receive.
        </p>
      </div>
      <SetupWizard initial={profile} garminEmail={garmin.email} />
    </main>
  );
}
