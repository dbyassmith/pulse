import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve relative to this file: src/lib/../../.env = backend/.env
const envPath = join(__dirname, "..", "..", ".env");
config({ path: envPath });

export function getConfig() {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const braveApiKey = process.env.BRAVE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const port = parseInt(process.env.PORT || "3000", 10);

  const cooldownRaw = process.env.WATCHLIST_CHECK_COOLDOWN_HOURS;
  const watchlistCheckCooldownHours =
    cooldownRaw === undefined || cooldownRaw === "" ? 20 : Number(cooldownRaw);

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
  }

  if (!braveApiKey) {
    throw new Error("BRAVE_API_KEY environment variable is not set.");
  }

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL environment variable is not set.");
  }

  if (!supabaseAnonKey) {
    throw new Error("SUPABASE_ANON_KEY environment variable is not set.");
  }

  if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set.");
  }

  if (!cronSecret) {
    throw new Error("CRON_SECRET environment variable is not set.");
  }

  if (cronSecret.length < 32) {
    throw new Error("CRON_SECRET must be at least 32 characters long.");
  }

  if (!Number.isFinite(watchlistCheckCooldownHours) || watchlistCheckCooldownHours < 0) {
    throw new Error(
      "WATCHLIST_CHECK_COOLDOWN_HOURS must be a non-negative number."
    );
  }

  return {
    anthropicApiKey,
    braveApiKey,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    cronSecret,
    watchlistCheckCooldownHours,
    port,
  };
}
