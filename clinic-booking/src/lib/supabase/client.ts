import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

let client: SupabaseClient | undefined;

export function getBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  }
  return client;
}
