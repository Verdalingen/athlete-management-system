"use server";

import { createServerClient as createSSRClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE, isLanguage } from "@/lib/i18n/language";
import { getAuthenticatedLanguage } from "@/lib/i18n/getServerLanguage";
import { dictionaries } from "@/lib/i18n/dictionaries";

async function getUid(): Promise<string> {
  const cookieStore = await cookies();
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function saveMaxHR(formData: FormData): Promise<{ error?: string }> {
  const uid = await getUid();
  const raw = formData.get("max_heart_rate_bpm") as string;
  const value = raw ? parseInt(raw, 10) : null;

  if (value !== null && (isNaN(value) || value < 100 || value > 230)) {
    const language = await getAuthenticatedLanguage(uid);
    return { error: dictionaries[language].profile.maxHR.validationError };
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await sb.from("user_settings").upsert(
    { user_id: uid, max_heart_rate_bpm: value, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return {};
}

export async function saveLanguage(language: string): Promise<{ error?: string }> {
  if (!isLanguage(language)) return { error: "Invalid language" };
  const uid = await getUid();

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await sb.from("user_settings").upsert(
    { user_id: uid, language, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };

  // Keeps the pre-auth cookie (read by the login page, which has no user_settings row to
  // consult) in sync with the account-level choice made here.
  const cookieStore = await cookies();
  cookieStore.set(LANGUAGE_COOKIE, language, { path: "/", maxAge: LANGUAGE_COOKIE_MAX_AGE, sameSite: "lax" });

  revalidatePath("/", "layout");
  return {};
}
