export type Language = "en" | "no";

export const DEFAULT_LANGUAGE: Language = "en";

// Mirrors the max-age of Supabase's own auth cookies (1 year) — this is a long-lived
// preference, not a session value.
export const LANGUAGE_COOKIE = "ams_lang";
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  no: "Norsk",
};

// The name an LLM prompt should use for "write in this language" — kept separate from the
// UI-facing LANGUAGE_NAMES value in case that one ever becomes an autonym-only label.
export const LANGUAGE_NAMES_FOR_PROMPTS: Record<Language, string> = {
  en: "English",
  no: "Norwegian (bokmål)",
};

export function isLanguage(value: string | null | undefined): value is Language {
  return value === "en" || value === "no";
}

// en-GB matches this app's existing date-formatting convention (see the profile page's
// "Member since" date); nb-NO is the Norwegian bokmål locale for everywhere else the app
// formats dates or numbers.
export function localeTag(language: Language): string {
  return language === "no" ? "nb-NO" : "en-GB";
}
