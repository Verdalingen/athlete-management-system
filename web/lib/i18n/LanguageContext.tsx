"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { saveLanguage } from "@/app/actions/user-settings";
import { dictionaries } from "./dictionaries";
import { LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE, type Language } from "./language";
import type { Dictionary } from "./types";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  t: dictionaries.en,
});

/**
 * `persist`: authenticated (app) pages write the choice to Supabase via `saveLanguage` (the
 * source of truth the Python coaching pipeline also reads) so it follows the account across
 * devices. The pre-auth login page has no user row to write to — there it only sets the
 * cookie, which `saveLanguage` also keeps in sync once the athlete does sign in.
 */
export function LanguageProvider({
  initialLanguage,
  persist = true,
  children,
}: {
  initialLanguage: Language;
  persist?: boolean;
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const [, startTransition] = useTransition();

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE}; samesite=lax`;
    } catch {
      // Cookies disabled/blocked — the in-memory context state above still switches the UI
      // for this session, it just won't persist across a reload.
    }
    if (persist) {
      startTransition(() => {
        void saveLanguage(next);
      });
    }
  }, [persist]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t: dictionaries[language] }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): [Language, (language: Language) => void] {
  const { language, setLanguage } = useContext(LanguageContext);
  return [language, setLanguage];
}

/** The current dictionary, reactive to the language toggle without a full page reload. */
export function useT(): Dictionary {
  return useContext(LanguageContext).t;
}
