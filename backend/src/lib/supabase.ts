import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "./config.js";

export function createAuthenticatedClient(accessToken: string): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
