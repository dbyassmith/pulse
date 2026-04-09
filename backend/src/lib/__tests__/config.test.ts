import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE_ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: "a-key",
  BRAVE_API_KEY: "b-key",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  CRON_SECRET: "x".repeat(32),
};

const originalEnv = { ...process.env };

async function loadConfig() {
  vi.resetModules();
  const mod = await import("../config.js");
  return mod.getConfig;
}

beforeEach(() => {
  // Wipe everything from BASE_ENV and the extras we toggle; start clean.
  for (const key of [
    ...Object.keys(BASE_ENV),
    "WATCHLIST_CHECK_COOLDOWN_HOURS",
    "PORT",
  ]) {
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
  it("returns all fields when the environment is fully populated", async () => {
    const getConfig = await loadConfig();
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

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const getConfig = await loadConfig();
    expect(() => getConfig()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("throws when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const getConfig = await loadConfig();
    expect(() => getConfig()).toThrow(/CRON_SECRET/);
  });

  it("throws when CRON_SECRET is shorter than 32 characters", async () => {
    process.env.CRON_SECRET = "short";
    const getConfig = await loadConfig();
    expect(() => getConfig()).toThrow(/at least 32/);
  });

  it("defaults WATCHLIST_CHECK_COOLDOWN_HOURS to 20 when unset", async () => {
    delete process.env.WATCHLIST_CHECK_COOLDOWN_HOURS;
    const getConfig = await loadConfig();
    expect(getConfig().watchlistCheckCooldownHours).toBe(20);
  });

  it("accepts WATCHLIST_CHECK_COOLDOWN_HOURS=0 as a valid value", async () => {
    process.env.WATCHLIST_CHECK_COOLDOWN_HOURS = "0";
    const getConfig = await loadConfig();
    expect(getConfig().watchlistCheckCooldownHours).toBe(0);
  });

  it("throws when WATCHLIST_CHECK_COOLDOWN_HOURS is not a number", async () => {
    process.env.WATCHLIST_CHECK_COOLDOWN_HOURS = "not-a-number";
    const getConfig = await loadConfig();
    expect(() => getConfig()).toThrow(/WATCHLIST_CHECK_COOLDOWN_HOURS/);
  });
});
