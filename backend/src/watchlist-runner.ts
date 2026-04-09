import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchForDate } from "./search.js";
import { createServiceClient } from "./lib/supabase.js";
import { getConfig } from "./lib/config.js";
import type { DateSearchResult } from "./lib/types.js";

type Confidence = "high" | "medium" | "low";

interface WatchlistItemRow {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  confidence_threshold: Confidence | null;
}

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
  action: "resolved" | "skipped" | "errored";
  result?: DateSearchResult;
  error?: string;
}

export interface SweepSummary {
  scanned: number;
  resolved: number;
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

  const { data: rows, error: selectError } = await supabase
    .from("watchlist_items")
    .select("id, user_id, title, category, subcategory, confidence_threshold")
    .eq("status", "active")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cooldownCutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (selectError) {
    throw new Error(`Failed to load watchlist items: ${selectError.message}`);
  }

  const items: SweepItemResult[] = [];
  let scanned = 0;
  let resolved = 0;
  let skipped = 0;
  let errored = 0;

  const eligible = (rows ?? []) as WatchlistItemRow[];
  const total = eligible.length;
  console.log(`[watchlist-runner] loaded ${total} eligible item(s) (cooldown=${cooldownHours}h, limit=${limit})`);

  for (const item of eligible) {
    scanned++;
    if (scanned > 1) {
      await sleep(interItemDelayMs);
    }

    const query = buildQuery(item);
    console.log(`[watchlist-runner] [${scanned}/${total}] searching: "${query}" (id=${item.id})`);

    let result: DateSearchResult;
    try {
      result = await searchFn(query);
    } catch (err) {
      // Do NOT update last_checked_at — let the next run retry this item.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[watchlist-runner] [${scanned}/${total}] errored: ${item.title} — ${msg}`);
      errored++;
      items.push({
        id: item.id,
        action: "errored",
        error: msg,
      });
      continue;
    }

    const hasUsableDate = result.found && typeof result.date === "string" && result.date.length > 0;
    const isMatch = hasUsableDate && meetsThreshold(result.confidence, item.confidence_threshold);

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

      // 2. Mark watchlist item resolved + record check metadata
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
        // Partial-write hazard: confirmed_dates row exists but watchlist still active.
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
    console.log(`[watchlist-runner] [${scanned}/${total}] skipped: ${item.title} — ${reason}`);

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
    `[watchlist-runner] sweep complete: scanned=${scanned}, resolved=${resolved}, skipped=${skipped}, errored=${errored}`
  );

  return {
    scanned,
    resolved,
    skipped,
    errored,
    items,
    duration_ms: Date.now() - start,
  };
}
