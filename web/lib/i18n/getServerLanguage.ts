import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase-server";
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, isLanguage, type Language } from "./language";

/** Pre-auth pages (login): no `user_settings` row to read yet, so the cookie the toggle sets
 * is the only signal available. `saveLanguage` keeps this cookie in sync once the athlete
 * signs in, so it also seeds the very first authenticated read below. */
export async function getCookieLanguage(): Promise<Language> {
  const cookieStore = await cookies();
  return resolveLanguage(cookieStore.get(LANGUAGE_COOKIE)?.value);
}

/** Authenticated (app) pages: `user_settings.language` is the source of truth — it's what the
 * Python coaching pipeline reads too, and it follows the account across devices — falling back
 * to the pre-auth cookie only for a brand-new account with no settings row yet. */
export async function getAuthenticatedLanguage(userId: string): Promise<Language> {
  const sb = createServerClient();
  const { data } = await sb
    .from("user_settings")
    .select("language")
    .eq("user_id", userId)
    .maybeSingle();

  if (isLanguage(data?.language)) return data.language;
  return getCookieLanguage();
}

function resolveLanguage(value: string | undefined): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}
