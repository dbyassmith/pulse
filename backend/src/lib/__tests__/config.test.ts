import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Import once at the top so dotenv runs exactly once. `getConfig` reads
// process.env lazily on every call, so we can mutate it between tests.
import { getConfig } from "../config.js";

const BASE_ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: "a-key",
  BRAVE_API_KEY: "b-key",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  CRON_SECRET: "x".repeat(32),
  WATCHLIST_CHECK_COOLDOWN_HOURS: "20",
};

// All env keys we touch in this file. We delete and re-set these on every
// test so the real backend/.env values (loaded once by dotenv at import) do
// not bleed across tests.
const MANAGED_KEYS = [
  ...Object.keys(BASE_ENV),
  "PORT",
];

const originalEnv = { ...process.env };

beforeEach(() => {
  for (const key of MANAGED_KEYS) {
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(BASE_ENV)) {
    process.env[k] = v;
  }
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getConfig", () => {
  it("returns all fields when the environment is fully populated", () => {
    const c = getConfig();
    expect(c.anthropicApiKey).toBe("a-key");
    expect(c.braveApiKey).toBe("b-key");
    expect(c.supabaseUrl).toBe("https://example.supabase.co");
    expect(c.supabaseAnonKey).toBe("anon-key");
    expect(c.supabaseServiceRoleKey).toBe("service-key");
    expect(c.cronSecret).toBe("x".repeat(32));
    expect(c.watchlistCheckCooldownHours).toBe(20);
    expect(c.port).toBe(3000);
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getConfig()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("throws when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    expect(() => getConfig()).toThrow(/CRON_SECRET/);
  });

  it("throws when CRON_SECRET is shorter than 32 characters", () => {
    process.env.CRON_SECRET = "short";
    expect(() => getConfig()).toThrow(/at least 32/);
  });

  it("defaults WATCHLIST_CHECK_COOLDOWN_HOURS to 20 when unset", () => {
    delete process.env.WATCHLIST_CHECK_COOLDOWN_HOURS;
    expect(getConfig().watchlistCheckCooldownHours).toBe(20);
  });

  it("accepts WATCHLIST_CHECK_COOLDOWN_HOURS=0 as a valid value", () => {
    process.env.WATCHLIST_CHECK_COOLDOWN_HOURS = "0";
    expect(getConfig().watchlistCheckCooldownHours).toBe(0);
  });

  it("throws when WATCHLIST_CHECK_COOLDOWN_HOURS is not a number", () => {
    process.env.WATCHLIST_CHECK_COOLDOWN_HOURS = "not-a-number";
    expect(() => getConfig()).toThrow(/WATCHLIST_CHECK_COOLDOWN_HOURS/);
  });
});
