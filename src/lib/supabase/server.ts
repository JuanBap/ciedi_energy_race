import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente de servidor — usa service role (sin RLS, todas las ops pasan por Next.js)
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
