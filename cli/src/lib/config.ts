export function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error("Error: SUPABASE_URL environment variable is not set.");
    process.exit(1);
  }

  if (!supabaseAnonKey) {
    console.error("Error: SUPABASE_ANON_KEY environment variable is not set.");
    process.exit(1);
  }

  return { supabaseUrl, supabaseAnonKey };
}
