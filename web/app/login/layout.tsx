import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { getCookieLanguage } from "@/lib/i18n/getServerLanguage";

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const language = await getCookieLanguage();
  // persist={false}: there's no signed-in user yet to own a user_settings row — the toggle
  // here only sets the cookie, which saveLanguage() then adopts once the athlete signs in.
  return (
    <LanguageProvider initialLanguage={language} persist={false}>
      {children}
    </LanguageProvider>
  );
}
