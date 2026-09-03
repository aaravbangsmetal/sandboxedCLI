import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabasePublicConfig, supabaseServiceRoleKey } from "./config";

export function createSupabaseAdminClient() {
  const config = supabasePublicConfig();
  return createClient(config.url, supabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
