"use server";

import { createServerClient, getUserId } from "@/lib/supabase-server";

export async function storeGarminCredentials(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  try {
    const uid = await getUserId();
    const sb = createServerClient();
    const { error } = await sb.rpc("store_garmin_credentials", {
      p_user_id: uid,
      p_email: email,
      p_password: password,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function deleteGarminCredentials(): Promise<{ error: string | null }> {
  try {
    const uid = await getUserId();
    const sb = createServerClient();
    const { error } = await sb.rpc("delete_garmin_credentials", {
      p_user_id: uid,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
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
