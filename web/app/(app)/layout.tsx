import { Sidebar } from "@/app/Sidebar";
import { ThemeProvider } from "@/app/ThemeContext";
import { UnitSystemProvider } from "@/app/(app)/nutrition/UnitSystemContext";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { getAuthenticatedLanguage } from "@/lib/i18n/getServerLanguage";
import { getUserId } from "@/lib/supabase-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const uid = await getUserId();
  const language = await getAuthenticatedLanguage(uid);
  return (
    <LanguageProvider initialLanguage={language}>
      <ThemeProvider>
        <div className="app-shell">
          <Sidebar />
          <div className="main-area">
            <UnitSystemProvider>{children}</UnitSystemProvider>
          </div>
        </div>
      </ThemeProvider>
    </LanguageProvider>
  );
}
