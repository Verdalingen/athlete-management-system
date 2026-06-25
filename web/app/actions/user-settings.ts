"use server";

import { createServerClient as createSSRClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

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
    return { error: "Max HR must be between 100 and 230 bpm" };
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
