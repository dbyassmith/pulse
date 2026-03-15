import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { searchForDate } from "../search.js";

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
}

// --- Zod schemas for every tool input (TODO 014) ---

const SearchForDateInput = z.object({
  query: z.string().min(1),
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const AddConfirmedDateInput = z.object({
  title: z.string().min(1).max(200),
  date: dateString,
  confidence: z.enum(["high", "medium", "low"]),
  source: z.string().optional(),
  notes: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
});

const CreateWatchlistItemInput = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(["one-time", "recurring-irregular", "recurring-predictable", "series", "category-watch"]).default("one-time"),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  notes: z.string().optional(),
});

const ListConfirmedDatesInput = z.object({
  category: z.string().optional(),
  include_past: z.boolean().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

const ListWatchlistItemsInput = z.object({
  category: z.string().optional(),
  status: z.enum(["active", "resolved", "removed"]).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

const ALLOWED_TABLES = new Set(["confirmed_dates", "watchlist_items"] as const);
type AllowedTable = "confirmed_dates" | "watchlist_items";

const GetItemDetailsInput = z.object({
  table: z.string().min(1),
  id: z.string().min(1),
});

const UpdateConfirmedDateInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  date: dateString.optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
});

const UpdateWatchlistItemInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  type: z.enum(["one-time", "recurring-irregular", "recurring-predictable", "series", "category-watch"]).optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "resolved", "removed"]).optional(),
});

const DeleteItemInput = z.object({
  id: z.string().min(1),
});

// --- Helpers ---

function parseInput<T>(schema: z.ZodType<T>, input: Record<string, unknown>): { data: T } | { error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { error: `Invalid input: ${issues}` };
  }
  return { data: result.data };
}

function clampPagination(rawLimit: number | undefined, rawOffset: number | undefined) {
  const limit = Math.min(Math.max(Number(rawLimit) || 25, 1), 100);
  const offset = Math.max(Number(rawOffset) || 0, 0);
  return { limit, offset };
}

// Shared delete helper (TODO 027)
async function executeDelete(
  table: AllowedTable,
  id: string,
  context: ToolContext,
  label: string
): Promise<string> {
  const { data, error } = await context.supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("user_id", context.userId)
    .select("id, title")
    .maybeSingle();

  if (error) return JSON.stringify({ error: error.message });
  if (!data) return JSON.stringify({ error: `No ${label} found with ID "${id}".` });
  return JSON.stringify({ success: true, deleted: { id: data.id, title: data.title } });
}

// Shared update helper (TODO 027)
async function executeUpdate(
  table: AllowedTable,
  id: string,
  fields: string[],
  input: Record<string, unknown>,
  context: ToolContext,
  label: string,
  extraUpdates?: Record<string, unknown>
): Promise<string> {
  const updates: Record<string, unknown> = { ...extraUpdates };
  for (const key of fields) {
    if (input[key] !== undefined) {
      updates[key] =
        key === "category" || key === "subcategory"
          ? (input[key] as string).toLowerCase().trim()
          : input[key];
    }
  }

  const userFieldCount = Object.keys(updates).length - Object.keys(extraUpdates ?? {}).length;
  if (userFieldCount === 0) {
    return JSON.stringify({ error: "No fields to update. Provide at least one field to change." });
  }

  const { data, error } = await context.supabase
    .from(table)
    .update(updates)
    .eq("id", id)
    .eq("user_id", context.userId)
    .select("id, title")
    .maybeSingle();

  if (error) return JSON.stringify({ error: error.message });
  if (!data) return JSON.stringify({ error: `No ${label} found with ID "${id}".` });
  return JSON.stringify({
    success: true,
    id: data.id,
    title: data.title,
    updated_fields: Object.keys(updates).filter((k) => k !== "updated_at"),
  });
}

// --- Main dispatcher ---

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  switch (name) {
    case "search_for_date":
      return executeSearchForDate(input);
    case "add_confirmed_date":
      return executeAddConfirmedDate(input, context);
    case "create_watchlist_item":
      return executeCreateWatchlistItem(input, context);
    case "list_confirmed_dates":
      return executeListConfirmedDates(input, context);
    case "list_watchlist_items":
      return executeListWatchlistItems(input, context);
    case "get_item_details":
      return executeGetItemDetails(input, context);
    case "update_confirmed_date":
      return executeUpdateConfirmedDate(input, context);
    case "update_watchlist_item":
      return executeUpdateWatchlistItem(input, context);
    case "delete_confirmed_date":
      return executeDeleteConfirmedDate(input, context);
    case "delete_watchlist_item":
      return executeDeleteWatchlistItem(input, context);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// --- Tool executors ---

async function executeSearchForDate(input: Record<string, unknown>): Promise<string> {
  const parsed = parseInput(SearchForDateInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  const result = await searchForDate(parsed.data.query);
  return JSON.stringify(result);
}

async function executeAddConfirmedDate(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(AddConfirmedDateInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  const data = parsed.data;
  const id = crypto.randomUUID();

  const { error } = await context.supabase.from("confirmed_dates").insert({
    id,
    user_id: context.userId,
    title: data.title,
    date: data.date,
    confidence: data.confidence,
    source: data.source ?? null,
    notes: data.notes ?? null,
    category: (data.category ?? "").toLowerCase() || null,
    subcategory: (data.subcategory ?? "").toLowerCase().trim() || null,
  });

  if (error) {
    return JSON.stringify({ error: `Failed to save date: ${error.message}` });
  }

  return JSON.stringify({
    success: true,
    id,
    title: data.title,
    date: data.date,
  });
}

async function executeCreateWatchlistItem(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(CreateWatchlistItemInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  const data = parsed.data;
  const id = crypto.randomUUID();

  const { error } = await context.supabase.from("watchlist_items").upsert(
    {
      id,
      user_id: context.userId,
      title: data.title,
      type: data.type,
      category: (data.category ?? "").toLowerCase() || null,
      subcategory: (data.subcategory ?? "").toLowerCase().trim() || null,
      notes: data.notes ?? null,
      added: new Date().toISOString(),
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,id" }
  );

  if (error) {
    return JSON.stringify({
      error: `Failed to create watchlist item: ${error.message}`,
    });
  }

  return JSON.stringify({
    success: true,
    id,
    title: data.title,
    type: data.type,
  });
}

async function executeListConfirmedDates(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(ListConfirmedDatesInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  const data = parsed.data;
  const { limit, offset } = clampPagination(data.limit, data.offset);

  let query = context.supabase
    .from("confirmed_dates")
    .select("id, title, date, category", { count: "exact" })
    .eq("user_id", context.userId)
    .order("date", { ascending: true })
    .range(offset, offset + limit - 1);

  if (!data.include_past) {
    query = query.gte("date", new Date().toISOString().split("T")[0]);
  }
  if (data.category) {
    query = query.eq("category", data.category.toLowerCase());
  }

  const { data: rows, error, count } = await query;
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ items: rows, total: count, returned: rows?.length ?? 0 });
}

async function executeListWatchlistItems(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(ListWatchlistItemsInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  const data = parsed.data;
  const { limit, offset } = clampPagination(data.limit, data.offset);

  let query = context.supabase
    .from("watchlist_items")
    .select("id, title, category, status", { count: "exact" })
    .eq("user_id", context.userId)
    .order("added", { ascending: false })
    .range(offset, offset + limit - 1);

  const status = data.status || "active";
  query = query.eq("status", status);

  if (data.category) {
    query = query.eq("category", data.category.toLowerCase());
  }

  const { data: rows, error, count } = await query;
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ items: rows, total: count, returned: rows?.length ?? 0 });
}

async function executeGetItemDetails(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(GetItemDetailsInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  const data = parsed.data;

  // Table injection allowlist (TODO 025)
  if (!ALLOWED_TABLES.has(data.table as AllowedTable)) {
    return JSON.stringify({ error: "Invalid table" });
  }
  const table = data.table as AllowedTable;

  const { data: row, error } = await context.supabase
    .from(table)
    .select("*")
    .eq("id", data.id)
    .eq("user_id", context.userId)
    .single();

  if (error) return JSON.stringify({ error: `Item not found: ${error.message}` });
  return JSON.stringify(row);
}

async function executeUpdateConfirmedDate(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(UpdateConfirmedDateInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  const data = parsed.data;
  return executeUpdate(
    "confirmed_dates",
    data.id,
    ["title", "date", "confidence", "source", "notes", "category", "subcategory"],
    data as Record<string, unknown>,
    context,
    "confirmed date"
  );
}

async function executeUpdateWatchlistItem(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(UpdateWatchlistItemInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  const data = parsed.data;
  return executeUpdate(
    "watchlist_items",
    data.id,
    ["title", "type", "category", "subcategory", "notes", "status"],
    data as Record<string, unknown>,
    context,
    "watchlist item",
    { updated_at: new Date().toISOString() }
  );
}

async function executeDeleteConfirmedDate(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(DeleteItemInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  return executeDelete("confirmed_dates", parsed.data.id, context, "confirmed date");
}

async function executeDeleteWatchlistItem(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const parsed = parseInput(DeleteItemInput, input);
  if ("error" in parsed) return JSON.stringify({ error: parsed.error });

  return executeDelete("watchlist_items", parsed.data.id, context, "watchlist item");
}
