import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchForDate } from "./search.js";
import { createServiceClient } from "./lib/supabase.js";
import { getConfig } from "./lib/config.js";
import type { DateSearchResult } from "./lib/types.js";

type Confidence = "high" | "medium" | "low";
type WatchlistType = "one-time" | "recurring" | "series" | "category-watch";

interface WatchlistItemRow {
  id: string;
  user_id: string;
  title: string;
  type: WatchlistType;
  category: string | null;
  subcategory: string | null;
  confidence_threshold: Confidence | null;
  known_next_date: string | null;
}

export type SweepAction = "resolved" | "scheduled" | "skipped" | "errored";

export interface RunWatchlistSweepOptions {
  now?: Date;
  cooldownHours?: number;
  limit?: number;
  interItemDelayMs?: number;
  // dependency injection for tests
  supabase?: SupabaseClient;
  searchFn?: (query: string) => Promise<DateSearchResult>;
}

export interface SweepItemResult {
  id: string;
  action: SweepAction;
  result?: DateSearchResult;
  error?: string;
}

export interface SweepSummary {
  scanned: number;
  resolved: number;
  scheduled: number;
  skipped: number;
  errored: number;
  items: SweepItemResult[];
  duration_ms: number;
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Postgres unique_violation error code — raised by the confirmed_dates
// (user_id, title, date) unique constraint when the runner tries to insert
// a row that already exists (e.g. reactivated recurring item re-finds the
// same still-valid upcoming date before a newer one is announced).
const PG_UNIQUE_VIOLATION = "23505";

function meetsThreshold(
  resultConfidence: Confidence | null,
  itemThreshold: Confidence | null
): boolean {
  if (!resultConfidence) return false;
  const effective: Confidence = itemThreshold ?? "medium";
  return CONFIDENCE_RANK[resultConfidence] >= CONFIDENCE_RANK[effective];
}

function buildQuery(item: Pick<WatchlistItemRow, "title" | "category">): string {
  if (item.category && item.category.length > 0) {
    return `${item.title} ${item.category}`;
  }
  return item.title;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.toLowerCase().trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runWatchlistSweep(
  options: RunWatchlistSweepOptions = {}
): Promise<SweepSummary> {
  const start = Date.now();
  const now = options.now ?? new Date();
  const cooldownHours =
    options.cooldownHours ?? getConfig().watchlistCheckCooldownHours;
  const limit = options.limit ?? 200;
  const interItemDelayMs = options.interItemDelayMs ?? 1000;
  const supabase = options.supabase ?? createServiceClient();
  const searchFn = options.searchFn ?? searchForDate;

  const cooldownCutoff = new Date(
    now.getTime() - cooldownHours * 60 * 60 * 1000
  ).toISOString();
  const todayDateOnly = toDateOnly(now);

  // Eligibility: status = 'active' AND (cooldown elapsed OR never checked)
  // AND (known_next_date is null OR known_next_date is in the past).
  //
  // Two chained .or() calls are AND-combined by PostgREST (each chained
  // method call adds an AND filter), so this produces:
  //   status = 'active'
  //   AND (last_checked_at IS NULL OR last_checked_at < cooldownCutoff)
  //   AND (known_next_date IS NULL OR known_next_date < today)
  const { data: rows, error: selectError } = await supabase
    .from("watchlist_items")
    .select(
      "id, user_id, title, type, category, subcategory, confidence_threshold, known_next_date"
    )
    .eq("status", "active")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cooldownCutoff}`)
    .or(`known_next_date.is.null,known_next_date.lt.${todayDateOnly}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (selectError) {
    throw new Error(`Failed to load watchlist items: ${selectError.message}`);
  }

  const items: SweepItemResult[] = [];
  let scanned = 0;
  let resolved = 0;
  let scheduled = 0;
  let skipped = 0;
  let errored = 0;

  const eligible = (rows ?? []) as WatchlistItemRow[];
  const total = eligible.length;
  console.log(
    `[watchlist-runner] loaded ${total} eligible item(s) (cooldown=${cooldownHours}h, limit=${limit})`
  );

  for (const item of eligible) {
    scanned++;
    if (scanned > 1) {
      await sleep(interItemDelayMs);
    }

    // Reactivation: if this item had a known upcoming date that has now
    // passed, clear known_next_date before searching. The eligibility query
    // already ensures we only see items where known_next_date < today, so
    // any non-null value here means "this recurring item's previous
    // occurrence has happened; look for the next one."
    if (item.known_next_date !== null) {
      console.log(
        `[watchlist-runner] [${scanned}/${total}] reactivating: ${item.title} (previous date=${item.known_next_date})`
      );
      const { error: clearError } = await supabase
        .from("watchlist_items")
        .update({
          known_next_date: null,
          updated_at: now.toISOString(),
        })
        .eq("id", item.id);
      if (clearError) {
        console.error(
          `[watchlist-runner] [${scanned}/${total}] failed to clear known_next_date for ${item.title}: ${clearError.message}`
        );
        errored++;
        items.push({
          id: item.id,
          action: "errored",
          error: `failed to clear known_next_date: ${clearError.message}`,
        });
        continue;
      }
    }

    const query = buildQuery(item);
    console.log(
      `[watchlist-runner] [${scanned}/${total}] searching: "${query}" (id=${item.id})`
    );

    let result: DateSearchResult;
    try {
      result = await searchFn(query);
    } catch (err) {
      // Do NOT update last_checked_at — let the next run retry this item.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[watchlist-runner] [${scanned}/${total}] errored: ${item.title} — ${msg}`
      );
      errored++;
      items.push({
        id: item.id,
        action: "errored",
        error: msg,
      });
      continue;
    }

    const hasUsableDate =
      result.found && typeof result.date === "string" && result.date.length > 0;
    const isMatch =
      hasUsableDate && meetsThreshold(result.confidence, item.confidence_threshold);

    if (isMatch && result.date && result.confidence) {
      console.log(
        `[watchlist-runner] [${scanned}/${total}] match: ${item.title} → ${result.date} (confidence=${result.confidence})`
      );

      // 1. Insert into confirmed_dates (same column layout as executeAddConfirmedDate)
      const confirmedId = crypto.randomUUID();
      const { error: insertError } = await supabase.from("confirmed_dates").insert({
        id: confirmedId,
        user_id: item.user_id,
        title: result.title || item.title,
        date: result.date,
        confidence: result.confidence,
        source: result.source ?? null,
        notes: result.notes ?? null,
        category: normalizeCategory(item.category),
        subcategory: normalizeCategory(item.subcategory),
      });

      if (insertError) {
        // Unique-violation on (user_id, title, date) means the date we found
        // is already on file — no new information. Refresh cooldown metadata
        // but leave known_next_date and status alone so the item isn't
        // re-searched until the cooldown elapses.
        const errCode = (insertError as { code?: string }).code;
        if (errCode === PG_UNIQUE_VIOLATION) {
          console.log(
            `[watchlist-runner] [${scanned}/${total}] duplicate confirmed_date for ${item.title} — refreshing cooldown only`
          );
          const { error: cooldownError } = await supabase
            .from("watchlist_items")
            .update({
              last_checked_at: now.toISOString(),
              last_search_found: true,
              last_search_notes: result.notes ?? null,
              updated_at: now.toISOString(),
            })
            .eq("id", item.id);
          if (cooldownError) {
            errored++;
            items.push({
              id: item.id,
              action: "errored",
              error: `cooldown refresh failed after duplicate: ${cooldownError.message}`,
              result,
            });
            continue;
          }
          skipped++;
          items.push({ id: item.id, action: "skipped", result });
          continue;
        }

        console.error(
          `[watchlist-runner] [${scanned}/${total}] confirmed_dates insert failed for ${item.title}: ${insertError.message}`
        );
        errored++;
        items.push({
          id: item.id,
          action: "errored",
          error: `confirmed_dates insert failed: ${insertError.message}`,
          result,
        });
        continue;
      }

      // 2. Update the watchlist row. Behavior branches by type.
      if (item.type === "recurring") {
        // Recurring items stay visible. Store the known upcoming date so
        // the eligibility query excludes this item until the date passes.
        const { error: updateError } = await supabase
          .from("watchlist_items")
          .update({
            known_next_date: result.date,
            last_checked_at: now.toISOString(),
            last_search_found: true,
            last_search_notes: result.notes ?? null,
            updated_at: now.toISOString(),
          })
          .eq("id", item.id);

        if (updateError) {
          console.error(
            `[watchlist-runner] [${scanned}/${total}] PARTIAL-WRITE: confirmed_dates id=${confirmedId} created but watchlist schedule failed for ${item.title}: ${updateError.message}`
          );
          errored++;
          items.push({
            id: item.id,
            action: "errored",
            error: `confirmed_dates inserted (id=${confirmedId}) but watchlist schedule failed: ${updateError.message}`,
            result,
          });
          continue;
        }

        console.log(
          `[watchlist-runner] [${scanned}/${total}] scheduled: ${item.title} → ${result.date} (recurring, stays visible)`
        );
        scheduled++;
        items.push({ id: item.id, action: "scheduled", result });
        continue;
      }

      // one-time / series / category-watch: current resolve-and-stop behavior.
      // TODO(follow-on): series should fan out into one-time children for
      // each event in the series. category-watch should spawn a fresh watch
      // for the next occurrence immediately on confirmation. Both are
      // deferred to follow-on plans; in v1 they behave like one-time.
      const { error: updateError } = await supabase
        .from("watchlist_items")
        .update({
          status: "resolved",
          last_checked_at: now.toISOString(),
          last_search_found: true,
          last_search_notes: result.notes ?? null,
          updated_at: now.toISOString(),
        })
        .eq("id", item.id);

      if (updateError) {
        console.error(
          `[watchlist-runner] [${scanned}/${total}] PARTIAL-WRITE: confirmed_dates id=${confirmedId} created but watchlist update failed for ${item.title}: ${updateError.message}`
        );
        errored++;
        items.push({
          id: item.id,
          action: "errored",
          error: `confirmed_dates inserted (id=${confirmedId}) but watchlist update failed: ${updateError.message}`,
          result,
        });
        continue;
      }

      console.log(`[watchlist-runner] [${scanned}/${total}] resolved: ${item.title}`);
      resolved++;
      items.push({ id: item.id, action: "resolved", result });
      continue;
    }

    // Non-match (either not found, no date, or below threshold) — record check metadata
    const reason = !result.found
      ? "no date found"
      : !hasUsableDate
        ? "no usable date"
        : `below threshold (got=${result.confidence}, need=${item.confidence_threshold ?? "medium"})`;
    console.log(
      `[watchlist-runner] [${scanned}/${total}] skipped: ${item.title} — ${reason}`
    );

    const { error: updateError } = await supabase
      .from("watchlist_items")
      .update({
        last_checked_at: now.toISOString(),
        last_search_found: result.found ?? false,
        last_search_notes: result.notes ?? null,
        updated_at: now.toISOString(),
      })
      .eq("id", item.id);

    if (updateError) {
      console.error(
        `[watchlist-runner] [${scanned}/${total}] last_checked_at update failed for ${item.title}: ${updateError.message}`
      );
      errored++;
      items.push({
        id: item.id,
        action: "errored",
        error: `last_checked_at update failed: ${updateError.message}`,
        result,
      });
      continue;
    }

    skipped++;
    items.push({ id: item.id, action: "skipped", result });
  }

  console.log(
    `[watchlist-runner] sweep complete: scanned=${scanned}, resolved=${resolved}, scheduled=${scheduled}, skipped=${skipped}, errored=${errored}`
  );

  return {
    scanned,
    resolved,
    scheduled,
    skipped,
    errored,
    items,
    duration_ms: Date.now() - start,
  };
}
