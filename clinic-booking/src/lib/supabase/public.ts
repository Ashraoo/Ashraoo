import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Anonymous client for public RPCs from Server Components (no session, no cookies). */
export function getPublicClient() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
