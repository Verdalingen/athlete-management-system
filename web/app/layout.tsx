import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Garmin AI Coach",
  description: "AI-powered training dashboard",
};

function HeaderDate() {
  const d = new Date();
  return (
    <span className="header-date">
      {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
    </span>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <span className="site-brand">Garmin AI Coach</span>
            <nav className="site-nav">
              <Link href="/" className="nav-link">Today</Link>
              <Link href="/week" className="nav-link">Week</Link>
              <Link href="/plan" className="nav-link">Plan</Link>
              <Link href="/report" className="nav-link">Report</Link>
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <HeaderDate />
              <form action={signOut}>
                <button type="submit" className="nav-link" style={{ background: "none", border: "none", cursor: "pointer" }}>
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
