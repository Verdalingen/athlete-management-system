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

/** Appended to a direct LLM system prompt (e.g. the nutrition API routes' own Anthropic
 * calls, outside the Python LangGraph pipeline) so athlete-facing generated text — meal
 * names, descriptions, target notes — comes back in the athlete's selected language.
 * Empty for English, so it's a no-op unless Norwegian is actually selected. Mirrors
 * get_language_instructions() in services/ai/langgraph/nodes/prompt_components.py. */
export function languagePromptInstruction(language: Language): string {
  if (language === "en") return "";
  return `\n\nWrite all athlete-facing natural-language text (names, descriptions, notes) in ${LANGUAGE_NAMES_FOR_PROMPTS[language]}. Keep JSON keys and numeric values as specified.`;
}

// en-GB matches this app's existing date-formatting convention (see the profile page's
// "Member since" date); nb-NO is the Norwegian bokmål locale for everywhere else the app
// formats dates or numbers.
export function localeTag(language: Language): string {
  return language === "no" ? "nb-NO" : "en-GB";
}
