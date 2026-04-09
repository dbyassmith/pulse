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

/**
 * Creates a Supabase client authenticated with the service role key.
 *
 * This client bypasses Row Level Security and can read/write across all users.
 * It is intended ONLY for trusted server-side background jobs such as the
 * watchlist cron runner. Do not use it in any user-facing request path.
 */
export function createServiceClient(): SupabaseClient {
  const { supabaseUrl, supabaseServiceRoleKey } = getConfig();

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
