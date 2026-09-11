import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Service-role client for data queries — bypasses RLS, never sent to browser.
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Returns the authenticated user's ID from the current session.
// Middleware guarantees a valid session exists before any page renders,
// so this will always resolve in practice.
//
// DEMO_USER_ID (development only) overrides which user's *data* is read, so the
// app can be explored with the fictional athlete from supabase/seed_demo.sql
// instead of real data. Authentication is unchanged — you still have to be
// signed in, and the guard below means this can never take effect in a
// production build. It is deliberately not an auth bypass.
export async function getUserId(): Promise<string> {
  if (process.env.NODE_ENV === "development" && process.env.DEMO_USER_ID) {
    await requireSession();
    return process.env.DEMO_USER_ID;
  }
  const cookieStore = await cookies();
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // no-op: middleware handles token refresh
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// Throws unless the caller has a valid Supabase session. Used by the DEMO_USER_ID
// path so that overriding the data source never weakens the auth requirement.
async function requireSession(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
}

// First name for the dashboard greeting — falls back through OAuth metadata to the
// email's local part, since there's no dedicated profile "name" field today.
//
// Follows the same DEMO_USER_ID override as getUserId. Without this the greeting
// read the signed-in operator's own name while every figure beneath it belonged
// to the demo athlete — which put a real name on screenshots of synthetic data.
export async function getUserFirstName(): Promise<string> {
  if (process.env.NODE_ENV === "development" && process.env.DEMO_USER_ID) {
    await requireSession();
    const admin = createServerClient();
    const { data } = await admin.auth.admin.getUserById(process.env.DEMO_USER_ID);
    const demoName: string | undefined =
      data?.user?.user_metadata?.full_name ?? data?.user?.user_metadata?.name;
    if (demoName) return demoName.split(" ")[0];
    return "there";
  }
  const cookieStore = await cookies();
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const fullName: string | undefined = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  if (fullName) return fullName.split(" ")[0];
  if (user?.email) return user.email.split("@")[0];
  return "there";
}
