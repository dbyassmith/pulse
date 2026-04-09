import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DateSearchResult } from "../lib/types.js";

/**
 * Minimal fake Supabase client that implements just the chain methods the
 * runner uses:
 *
 *   from('watchlist_items')
 *     .select(columns)
 *     .eq('status', 'active')
 *     .or(orExpr)
 *     .order(col, { ascending, nullsFirst })
 *     .limit(n)
 *   → { data, error }
 *
 *   from('confirmed_dates').insert(row) → { error }
 *   from('watchlist_items').update(row).eq('id', id) → { error }
 *
 * We record every mutating call so tests can assert behavior.
 */
type WatchRow = {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  confidence_threshold: "high" | "medium" | "low" | null;
  last_checked_at: string | null;
};

type InsertCall = { table: string; row: Record<string, unknown> };
type UpdateCall = { table: string; patch: Record<string, unknown>; id: string };

interface FakeOptions {
  selectRows: WatchRow[];
  selectError?: { message: string } | null;
  insertErrorFor?: (row: Record<string, unknown>) => { message: string } | null;
  updateErrorFor?: (id: string, patch: Record<string, unknown>) => { message: string } | null;
}

function createFakeSupabase(opts: FakeOptions) {
  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  let lastSelectFilter: { orExpr?: string; limit?: number } = {};

  const client = {
    from(table: string) {
      if (table === "watchlist_items") {
        return {
          // SELECT chain
          select(_cols: string) {
            const chain = {
              eq(_col: string, _val: unknown) {
                return chain;
              },
              or(expr: string) {
                lastSelectFilter.orExpr = expr;
                return chain;
              },
              order(_col: string, _opts: unknown) {
                return chain;
              },
              limit(n: number) {
                lastSelectFilter.limit = n;
                const rows = opts.selectRows.slice(0, n);
                return Promise.resolve({
                  data: opts.selectError ? null : rows,
                  error: opts.selectError ?? null,
                });
              },
            };
            return chain;
          },
          // UPDATE chain
          update(patch: Record<string, unknown>) {
            return {
              eq(_col: string, id: string) {
                const err = opts.updateErrorFor?.(id, patch) ?? null;
                updates.push({ table, patch, id });
                return Promise.resolve({ error: err });
              },
            };
          },
        };
      }
      if (table === "confirmed_dates") {
        return {
          insert(row: Record<string, unknown>) {
            const err = opts.insertErrorFor?.(row) ?? null;
            inserts.push({ table, row });
            return Promise.resolve({ error: err });
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, inserts, updates, lastSelectFilter };
}

function makeItem(partial: Partial<WatchRow> = {}): WatchRow {
  return {
    id: partial.id ?? "item-1",
    user_id: partial.user_id ?? "user-1",
    title: partial.title ?? "WWDC 2026",
    category: partial.category ?? "tech",
    subcategory: partial.subcategory ?? null,
    confidence_threshold: partial.confidence_threshold ?? null,
    last_checked_at: partial.last_checked_at ?? null,
  };
}

function makeSearchResult(partial: Partial<DateSearchResult> = {}): DateSearchResult {
  return {
    found: partial.found ?? true,
    date: partial.date ?? "2026-06-09",
    confidence: partial.confidence ?? "high",
    source: partial.source ?? "https://apple.com",
    title: partial.title ?? "WWDC 2026",
    notes: partial.notes ?? "Confirmed on apple.com",
  };
}

// Import after the helpers so the module graph is clean.
import { runWatchlistSweep } from "../watchlist-runner.js";

const baseConfigEnv = {
  ANTHROPIC_API_KEY: "a",
  BRAVE_API_KEY: "b",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CRON_SECRET: "x".repeat(32),
  WATCHLIST_CHECK_COOLDOWN_HOURS: "20",
};

beforeEach(() => {
  for (const [k, v] of Object.entries(baseConfigEnv)) {
    process.env[k] = v;
  }
});

describe("runWatchlistSweep", () => {
  it("happy path — single match at default threshold resolves the item", async () => {
    const item = makeItem();
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () => makeSearchResult({ confidence: "medium" }));

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    expect(summary.scanned).toBe(1);
    expect(summary.resolved).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.errored).toBe(0);

    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]?.table).toBe("confirmed_dates");
    expect(fake.inserts[0]?.row.user_id).toBe("user-1");
    expect(fake.inserts[0]?.row.date).toBe("2026-06-09");
    expect(fake.inserts[0]?.row.confidence).toBe("medium");

    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]?.patch.status).toBe("resolved");
    expect(fake.updates[0]?.patch.last_search_found).toBe(true);
  });

  it("happy path — no match just records last_checked_at and leaves status active", async () => {
    const item = makeItem();
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () =>
      makeSearchResult({ found: false, date: null, confidence: null, source: null, notes: "no date" })
    );

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    expect(summary.scanned).toBe(1);
    expect(summary.resolved).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.errored).toBe(0);

    expect(fake.inserts).toHaveLength(0);
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]?.patch.status).toBeUndefined();
    expect(fake.updates[0]?.patch.last_checked_at).toBeTruthy();
    expect(fake.updates[0]?.patch.last_search_found).toBe(false);
  });

  it("below-threshold result does not resolve but still records last_checked_at", async () => {
    const item = makeItem({ confidence_threshold: "high" });
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () => makeSearchResult({ confidence: "low" }));

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    expect(summary.scanned).toBe(1);
    expect(summary.resolved).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.updates[0]?.patch.last_search_found).toBe(true);
  });

  it("null threshold is treated as medium", async () => {
    // Medium result on null-threshold item should resolve
    const itemA = makeItem({ id: "a", confidence_threshold: null });
    const fakeA = createFakeSupabase({ selectRows: [itemA] });
    const sumA = await runWatchlistSweep({
      supabase: fakeA.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ confidence: "medium" })),
      interItemDelayMs: 0,
    });
    expect(sumA.resolved).toBe(1);

    // Low result on null-threshold item should NOT resolve
    const itemB = makeItem({ id: "b", confidence_threshold: null });
    const fakeB = createFakeSupabase({ selectRows: [itemB] });
    const sumB = await runWatchlistSweep({
      supabase: fakeB.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ confidence: "low" })),
      interItemDelayMs: 0,
    });
    expect(sumB.resolved).toBe(0);
    expect(sumB.skipped).toBe(1);
  });

  it("honors the limit option", async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeItem({ id: `item-${i}`, user_id: `user-${i}` })
    );
    const fake = createFakeSupabase({ selectRows: items });
    const searchFn = vi.fn(async () => makeSearchResult({ found: false, date: null, confidence: null, source: null }));

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      limit: 5,
      interItemDelayMs: 0,
    });

    expect(summary.scanned).toBe(5);
    expect(searchFn).toHaveBeenCalledTimes(5);
    expect(fake.lastSelectFilter.limit).toBe(5);
  });

  it("builds the cooldown filter using the supplied `now` and cooldownHours", async () => {
    const item = makeItem();
    const fake = createFakeSupabase({ selectRows: [item] });
    const fixedNow = new Date("2026-04-09T12:00:00.000Z");

    await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ found: false, date: null, confidence: null, source: null })),
      now: fixedNow,
      cooldownHours: 20,
      interItemDelayMs: 0,
    });

    // 20 hours before fixedNow = 2026-04-08T16:00:00.000Z
    expect(fake.lastSelectFilter.orExpr).toContain("last_checked_at.is.null");
    expect(fake.lastSelectFilter.orExpr).toContain("2026-04-08T16:00:00.000Z");
  });

  it("returns cleanly when zero items are eligible", async () => {
    const fake = createFakeSupabase({ selectRows: [] });
    const searchFn = vi.fn();

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    expect(summary).toMatchObject({
      scanned: 0,
      resolved: 0,
      skipped: 0,
      errored: 0,
      items: [],
    });
    expect(searchFn).not.toHaveBeenCalled();
  });

  it("continues after a searchFn throw and does not update last_checked_at for the errored item", async () => {
    const good = makeItem({ id: "good", title: "Google IO 2026" });
    const bad = makeItem({ id: "bad", title: "WWDC 2026" });
    const fake = createFakeSupabase({ selectRows: [bad, good] });

    const searchFn = vi.fn(async (query: string) => {
      if (query.startsWith("WWDC")) {
        throw new Error("Brave rate-limited");
      }
      return makeSearchResult({ found: false, date: null, confidence: null, source: null });
    });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    // bad item should not have triggered an update; good item should have
    const updatedIds = fake.updates.map((u) => u.id);
    expect(updatedIds).not.toContain("bad");
    expect(updatedIds).toContain("good");
    expect(summary.errored).toBe(1);
    expect(summary.items.find((i) => i.id === "bad")?.action).toBe("errored");
    expect(summary.items.find((i) => i.id === "bad")?.error).toContain("Brave rate-limited");
  });

  it("records an errored item when confirmed_dates insert fails", async () => {
    const item = makeItem();
    const fake = createFakeSupabase({
      selectRows: [item],
      insertErrorFor: () => ({ message: "unique violation" }),
    });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ confidence: "high" })),
      interItemDelayMs: 0,
    });

    expect(summary.errored).toBe(1);
    expect(summary.resolved).toBe(0);
    // Watchlist update should NOT have been attempted after a failed insert.
    expect(fake.updates).toHaveLength(0);
    expect(summary.items[0]?.error).toContain("unique violation");
  });

  it("records errored state when insert succeeds but watchlist update fails (partial-write hazard)", async () => {
    const item = makeItem();
    const fake = createFakeSupabase({
      selectRows: [item],
      updateErrorFor: () => ({ message: "connection lost" }),
    });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ confidence: "high" })),
      interItemDelayMs: 0,
    });

    expect(summary.errored).toBe(1);
    expect(summary.resolved).toBe(0);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.updates).toHaveLength(1);
    const erroredItem = summary.items[0];
    expect(erroredItem?.action).toBe("errored");
    expect(erroredItem?.error).toMatch(/confirmed_dates inserted/);
    expect(erroredItem?.result).toBeDefined();
  });

  it("integration scenario — three items: one match, one miss, one error", async () => {
    const matchItem = makeItem({ id: "match", title: "WWDC 2026" });
    const missItem = makeItem({ id: "miss", title: "iPhone 18" });
    const errorItem = makeItem({ id: "err", title: "Error Event" });

    const fake = createFakeSupabase({ selectRows: [matchItem, missItem, errorItem] });

    const searchFn = vi.fn(async (query: string) => {
      if (query.includes("WWDC")) return makeSearchResult({ confidence: "medium" });
      if (query.includes("iPhone"))
        return makeSearchResult({ found: false, date: null, confidence: null, source: null, notes: "no date yet" });
      throw new Error("boom");
    });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    expect(summary.scanned).toBe(3);
    expect(summary.resolved).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.errored).toBe(1);

    const byId = Object.fromEntries(summary.items.map((i) => [i.id, i.action]));
    expect(byId).toEqual({ match: "resolved", miss: "skipped", err: "errored" });
  });
});
