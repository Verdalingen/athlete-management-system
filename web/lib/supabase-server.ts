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
export async function getUserId(): Promise<string> {
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

// First name for the dashboard greeting — falls back through OAuth metadata to the
// email's local part, since there's no dedicated profile "name" field today.
export async function getUserFirstName(): Promise<string> {
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
