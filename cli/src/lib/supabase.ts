import { createClient } from "@supabase/supabase-js";
import { getConfig } from "./config.js";
import { fileStorage } from "./session.js";

export function getSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: fileStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
