import { createClient } from "@supabase/supabase-js";

// Server-only client — uses service_role key, never sent to the browser.
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function userId(): string {
  return process.env.SUPABASE_USER_ID!;
}
