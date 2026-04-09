import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DateSearchResult } from "../lib/types.js";

/**
 * Minimal fake Supabase client that implements just the chain methods the
 * runner uses:
 *
 *   from('watchlist_items')
 *     .select(columns)
 *     .eq('status', 'active')
 *     .or(orExpr)          (cooldown filter)
 *     .or(orExpr)          (known_next_date filter — second call)
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
  type: "one-time" | "recurring" | "series" | "category-watch";
  category: string | null;
  subcategory: string | null;
  confidence_threshold: "high" | "medium" | "low" | null;
  last_checked_at: string | null;
  known_next_date: string | null;
};

type InsertCall = { table: string; row: Record<string, unknown> };
type UpdateCall = { table: string; patch: Record<string, unknown>; id: string };

interface FakeOptions {
  selectRows: WatchRow[];
  selectError?: { message: string } | null;
  insertErrorFor?: (row: Record<string, unknown>) => { message?: string; code?: string } | null;
  updateErrorFor?: (id: string, patch: Record<string, unknown>) => { message: string } | null;
}

function createFakeSupabase(opts: FakeOptions) {
  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  const lastSelectFilter: { orExprs: string[]; limit?: number } = { orExprs: [] };

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
                lastSelectFilter.orExprs.push(expr);
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
    type: partial.type ?? "one-time",
    category: partial.category ?? "tech",
    subcategory: partial.subcategory ?? null,
    confidence_threshold: partial.confidence_threshold ?? null,
    last_checked_at: partial.last_checked_at ?? null,
    known_next_date: partial.known_next_date ?? null,
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
  it("happy path — one-time match at default threshold resolves the item", async () => {
    const item = makeItem({ type: "one-time" });
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () => makeSearchResult({ confidence: "medium" }));

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    expect(summary.scanned).toBe(1);
    expect(summary.resolved).toBe(1);
    expect(summary.scheduled).toBe(0);
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

  it("happy path — recurring match schedules the item without changing status", async () => {
    const item = makeItem({ id: "wwdc", title: "WWDC", type: "recurring" });
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () => makeSearchResult({ date: "2026-06-09", confidence: "high" }));

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    expect(summary.scanned).toBe(1);
    expect(summary.resolved).toBe(0);
    expect(summary.scheduled).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.errored).toBe(0);

    // confirmed_dates insert still happens
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]?.row.date).toBe("2026-06-09");

    // watchlist_items update must NOT set status to resolved.
    expect(fake.updates).toHaveLength(1);
    const patch = fake.updates[0]?.patch ?? {};
    expect(patch.status).toBeUndefined();
    expect(patch.known_next_date).toBe("2026-06-09");
    expect(patch.last_search_found).toBe(true);

    expect(summary.items[0]?.action).toBe("scheduled");
  });

  it("recurring match does not accidentally store the old known_next_date", async () => {
    // Item has a stale known_next_date from a previous cycle (already in the past).
    const item = makeItem({
      id: "wwdc",
      title: "WWDC",
      type: "recurring",
      known_next_date: "2025-06-09",
    });
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () => makeSearchResult({ date: "2026-06-09", confidence: "high" }));

    await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    // First update clears known_next_date (the reactivation step).
    // Second update writes the new known_next_date from the match.
    expect(fake.updates.length).toBeGreaterThanOrEqual(2);
    const clearPatch = fake.updates[0]?.patch ?? {};
    expect(clearPatch.known_next_date).toBeNull();

    const schedulePatch = fake.updates[fake.updates.length - 1]?.patch ?? {};
    expect(schedulePatch.known_next_date).toBe("2026-06-09");
  });

  it("reactivation: items with known_next_date in the past get cleared before search", async () => {
    const item = makeItem({
      id: "wwdc",
      title: "WWDC",
      type: "recurring",
      known_next_date: "2025-06-09",
    });
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () =>
      makeSearchResult({ found: false, date: null, confidence: null, source: null, notes: "no date yet" })
    );

    await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    // The very first update on this item must be the known_next_date clear,
    // and it must happen BEFORE searchFn is called.
    expect(fake.updates[0]?.patch.known_next_date).toBeNull();
    expect(searchFn).toHaveBeenCalled();
  });

  it("eligibility query includes both cooldown and known_next_date filters", async () => {
    const fake = createFakeSupabase({ selectRows: [] });
    const fixedNow = new Date("2026-04-09T12:00:00.000Z");

    await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(),
      now: fixedNow,
      cooldownHours: 20,
      interItemDelayMs: 0,
    });

    // Two chained .or() calls should have been made: one for cooldown, one for known_next_date.
    expect(fake.lastSelectFilter.orExprs).toHaveLength(2);
    expect(fake.lastSelectFilter.orExprs[0]).toContain("last_checked_at.is.null");
    expect(fake.lastSelectFilter.orExprs[0]).toContain("2026-04-08T16:00:00.000Z");
    expect(fake.lastSelectFilter.orExprs[1]).toContain("known_next_date.is.null");
    expect(fake.lastSelectFilter.orExprs[1]).toContain("2026-04-09");
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
    expect(summary.scheduled).toBe(0);
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
      scheduled: 0,
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

  it("records an errored item when confirmed_dates insert fails with a non-unique-violation error", async () => {
    const item = makeItem();
    const fake = createFakeSupabase({
      selectRows: [item],
      insertErrorFor: () => ({ message: "connection reset", code: "08000" }),
    });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ confidence: "high" })),
      interItemDelayMs: 0,
    });

    expect(summary.errored).toBe(1);
    expect(summary.resolved).toBe(0);
    // Watchlist update should NOT have been attempted after a non-unique-violation insert failure.
    expect(fake.updates).toHaveLength(0);
    expect(summary.items[0]?.error).toContain("connection reset");
  });

  it("treats confirmed_dates unique-violation (23505) as skipped, refreshes cooldown only", async () => {
    const item = makeItem({ id: "wwdc", title: "WWDC", type: "recurring" });
    const fake = createFakeSupabase({
      selectRows: [item],
      insertErrorFor: () => ({ message: "duplicate key", code: "23505" }),
    });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ date: "2026-06-09", confidence: "high" })),
      interItemDelayMs: 0,
    });

    // Insert was attempted and rejected
    expect(fake.inserts).toHaveLength(1);

    // Expected counts
    expect(summary.scanned).toBe(1);
    expect(summary.resolved).toBe(0);
    expect(summary.scheduled).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.errored).toBe(0);

    // A cooldown-refresh update was made. It must NOT set status, known_next_date, or clear it.
    expect(fake.updates).toHaveLength(1);
    const patch = fake.updates[0]?.patch ?? {};
    expect(patch.status).toBeUndefined();
    expect(patch.known_next_date).toBeUndefined();
    expect(patch.last_checked_at).toBeTruthy();
    expect(patch.last_search_found).toBe(true);

    expect(summary.items[0]?.action).toBe("skipped");
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

  it("stale match on a recurring item is skipped, not scheduled", async () => {
    // Runner "now" is fixed to 2026-04-09. Brave returns a date that's
    // already in the past (2026-04-04, the 2026 NCAA Final Four).
    const item = makeItem({ id: "ncaa", title: "NCAA Final Four", type: "recurring" });
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () => makeSearchResult({ date: "2026-04-04", confidence: "high" }));

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      now: new Date("2026-04-09T12:00:00.000Z"),
      interItemDelayMs: 0,
    });

    // No confirmed_dates insert at all — the stale match short-circuits
    // before the insert.
    expect(fake.inserts).toHaveLength(0);

    // The watchlist item gets a cooldown refresh but no status change
    // and no known_next_date set.
    expect(fake.updates).toHaveLength(1);
    const patch = fake.updates[0]?.patch ?? {};
    expect(patch.status).toBeUndefined();
    expect(patch.known_next_date).toBeUndefined();
    expect(patch.last_checked_at).toBeTruthy();
    expect(patch.last_search_found).toBe(true);

    // Counters
    expect(summary.scanned).toBe(1);
    expect(summary.scheduled).toBe(0);
    expect(summary.resolved).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.errored).toBe(0);
    expect(summary.items[0]?.action).toBe("skipped");
  });

  it("recurring match on today's date is scheduled, not flagged as stale", async () => {
    // Edge case: Brave returns today's date exactly. The guard uses
    // strict `< today`, so today should fall through to the normal
    // schedule path.
    const item = makeItem({ id: "masters", title: "The Masters", type: "recurring" });
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () => makeSearchResult({ date: "2026-04-09", confidence: "high" }));

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      now: new Date("2026-04-09T12:00:00.000Z"),
      interItemDelayMs: 0,
    });

    expect(summary.scheduled).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.updates[0]?.patch.known_next_date).toBe("2026-04-09");
  });

  it("one-time item with a past date still resolves (stale guard does not apply)", async () => {
    // A one-time item that matches a date Brave thinks already happened
    // should still resolve — it's a legitimate late resolution, not a
    // reactivation loop risk.
    const item = makeItem({ id: "reik", title: "Reik Live in Austin", type: "one-time" });
    const fake = createFakeSupabase({ selectRows: [item] });
    const searchFn = vi.fn(async () => makeSearchResult({ date: "2024-03-02", confidence: "medium" }));

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      now: new Date("2026-04-09T12:00:00.000Z"),
      interItemDelayMs: 0,
    });

    expect(summary.resolved).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.updates[0]?.patch.status).toBe("resolved");
  });

  it("series items still resolve (v1 — follow-on plan will change this)", async () => {
    const item = makeItem({ id: "f1", title: "F1 2026 Season", type: "series" });
    const fake = createFakeSupabase({ selectRows: [item] });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ confidence: "high" })),
      interItemDelayMs: 0,
    });

    expect(summary.resolved).toBe(1);
    expect(summary.scheduled).toBe(0);
    expect(fake.updates[0]?.patch.status).toBe("resolved");
  });

  it("category-watch items still resolve (v1 — follow-on plan will change this)", async () => {
    const item = makeItem({ id: "apple", title: "next Apple event", type: "category-watch" });
    const fake = createFakeSupabase({ selectRows: [item] });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn: vi.fn(async () => makeSearchResult({ confidence: "high" })),
      interItemDelayMs: 0,
    });

    expect(summary.resolved).toBe(1);
    expect(summary.scheduled).toBe(0);
    expect(fake.updates[0]?.patch.status).toBe("resolved");
  });

  it("integration scenario — four items: one-time match, recurring match, miss, error", async () => {
    const oneTimeItem = makeItem({ id: "onetime", title: "iPhone 18 Launch", type: "one-time" });
    const recurringItem = makeItem({ id: "rec", title: "WWDC", type: "recurring" });
    const missItem = makeItem({ id: "miss", title: "iPhone 19", type: "one-time" });
    const errorItem = makeItem({ id: "err", title: "Error Event", type: "one-time" });

    const fake = createFakeSupabase({ selectRows: [oneTimeItem, recurringItem, missItem, errorItem] });

    const searchFn = vi.fn(async (query: string) => {
      if (query.includes("iPhone 18")) return makeSearchResult({ confidence: "medium", date: "2026-09-15" });
      if (query.includes("WWDC")) return makeSearchResult({ confidence: "high", date: "2026-06-09" });
      if (query.includes("iPhone 19"))
        return makeSearchResult({ found: false, date: null, confidence: null, source: null, notes: "no date yet" });
      throw new Error("boom");
    });

    const summary = await runWatchlistSweep({
      supabase: fake.client as unknown as import("@supabase/supabase-js").SupabaseClient,
      searchFn,
      interItemDelayMs: 0,
    });

    expect(summary.scanned).toBe(4);
    expect(summary.resolved).toBe(1);
    expect(summary.scheduled).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.errored).toBe(1);

    const byId = Object.fromEntries(summary.items.map((i) => [i.id, i.action]));
    expect(byId).toEqual({
      onetime: "resolved",
      rec: "scheduled",
      miss: "skipped",
      err: "errored",
    });
  });
});
