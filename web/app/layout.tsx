import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getCookieLanguage } from "@/lib/i18n/getServerLanguage";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Hero/display face — see web/DESIGN.md "Typography": Geist alone read as a
// generic default per the frontend-design skill's guidance; this stays in the
// same sans-serif family (low risk, no register clash) but gives hero moments
// (dashboard greeting, big chart numbers) a distinct, less templated shape.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage-grotesque", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Athlete Management System",
  description: "AI-powered training dashboard",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Best-effort for <html lang> — the authoritative, per-account value lives in
  // user_settings.language and is read by app/(app)/layout.tsx for signed-in pages. This cookie
  // read covers pre-auth pages (login) too, and saveLanguage() keeps it in sync either way.
  const language = await getCookieLanguage();
  return (
    <html lang={language === "no" ? "nb" : "en"} className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3/dist/tabler-icons.min.css"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');var c=localStorage.getItem('sb-collapsed');if(c==='true')document.documentElement.classList.add('sb-collapsed-init');}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
