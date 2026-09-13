"use server";

import { createServerClient, getUserId } from "@/lib/supabase-server";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { getAuthenticatedLanguage, getCookieLanguage } from "@/lib/i18n/getServerLanguage";

// `uid` is only known once getUserId() has resolved, so a failure inside it (or before it)
// leaves us without an account to look up a saved language for — fall back to the pre-auth
// cookie in that case, same as getAuthenticatedLanguage itself does for a brand-new account.
async function resolveErrorLanguage(uid: string | undefined) {
  return uid ? getAuthenticatedLanguage(uid) : getCookieLanguage();
}

export async function storeGarminCredentials(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  let uid: string | undefined;
  try {
    uid = await getUserId();
    const sb = createServerClient();
    const { error } = await sb.rpc("store_garmin_credentials", {
      p_user_id: uid,
      p_email: email,
      p_password: password,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    const t = dictionaries[await resolveErrorLanguage(uid)].setup.garmin;
    if (e instanceof Error) return { error: e.message === "Not authenticated" ? t.notAuthenticated : e.message };
    return { error: t.unknownError };
  }
}

export async function deleteGarminCredentials(): Promise<{ error: string | null }> {
  let uid: string | undefined;
  try {
    uid = await getUserId();
    const sb = createServerClient();
    const { error } = await sb.rpc("delete_garmin_credentials", {
      p_user_id: uid,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    const t = dictionaries[await resolveErrorLanguage(uid)].setup.garmin;
    if (e instanceof Error) return { error: e.message === "Not authenticated" ? t.notAuthenticated : e.message };
    return { error: t.unknownError };
  }
}

export async function getGarminConnectionStatus(): Promise<{
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}> {
  try {
    const uid = await getUserId();
    const sb = createServerClient();
    const { data } = await sb
      .from("garmin_credentials")
      .select("garmin_email, connected_at")
      .eq("user_id", uid)
      .limit(1);
    const row = data?.[0];
    return {
      connected: !!row,
      email: row?.garmin_email ?? null,
      connectedAt: row?.connected_at ?? null,
    };
  } catch {
    return { connected: false, email: null, connectedAt: null };
  }
}
