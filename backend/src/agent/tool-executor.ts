import type { SupabaseClient } from "@supabase/supabase-js";
import { searchForDate } from "../search.js";

interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  switch (name) {
    case "search_for_date":
      return executeSearchForDate(input as { query: string });
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

async function executeSearchForDate(input: { query: string }): Promise<string> {
  const result = await searchForDate(input.query);
  return JSON.stringify(result);
}

async function executeAddConfirmedDate(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const id = crypto.randomUUID();
  const slug = slugify(input.title as string);

  const { error } = await context.supabase.from("confirmed_dates").insert({
    id: slug || id,
    user_id: context.userId,
    title: input.title,
    date: input.date,
    confidence: input.confidence,
    source: (input.source as string) ?? null,
    notes: (input.notes as string) ?? null,
    category: ((input.category as string) ?? "").toLowerCase() || null,
  });

  if (error) {
    return JSON.stringify({ error: `Failed to save date: ${error.message}` });
  }

  return JSON.stringify({
    success: true,
    id: slug || id,
    title: input.title,
    date: input.date,
  });
}

async function executeCreateWatchlistItem(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const slug = slugify(input.title as string);

  const { error } = await context.supabase.from("watchlist_items").upsert(
    {
      id: slug,
      user_id: context.userId,
      title: input.title,
      type: input.type || "one-time",
      category: ((input.category as string) ?? "").toLowerCase() || null,
      notes: (input.notes as string) ?? null,
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
    id: slug,
    title: input.title,
    type: input.type,
  });
}

async function executeListConfirmedDates(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const limit = (input.limit as number) || 25;
  const offset = (input.offset as number) || 0;

  let query = context.supabase
    .from("confirmed_dates")
    .select("id, title, date, category", { count: "exact" })
    .eq("user_id", context.userId)
    .order("date", { ascending: true })
    .range(offset, offset + limit - 1);

  if (!input.include_past) {
    query = query.gte("date", new Date().toISOString().split("T")[0]);
  }
  if (input.category) {
    query = query.eq("category", (input.category as string).toLowerCase());
  }

  const { data, error, count } = await query;
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ items: data, total: count, returned: data?.length ?? 0 });
}

async function executeListWatchlistItems(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const limit = (input.limit as number) || 25;
  const offset = (input.offset as number) || 0;

  let query = context.supabase
    .from("watchlist_items")
    .select("id, title, category, status", { count: "exact" })
    .eq("user_id", context.userId)
    .order("added", { ascending: false })
    .range(offset, offset + limit - 1);

  const status = (input.status as string) || "active";
  query = query.eq("status", status);

  if (input.category) {
    query = query.eq("category", (input.category as string).toLowerCase());
  }

  const { data, error, count } = await query;
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ items: data, total: count, returned: data?.length ?? 0 });
}

async function executeGetItemDetails(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const table = input.table as "confirmed_dates" | "watchlist_items";
  const { data, error } = await context.supabase
    .from(table)
    .select("*")
    .eq("id", input.id as string)
    .eq("user_id", context.userId)
    .single();

  if (error) return JSON.stringify({ error: `Item not found: ${error.message}` });
  return JSON.stringify(data);
}

async function executeUpdateConfirmedDate(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const updates: Record<string, unknown> = {};
  for (const key of ["title", "date", "confidence", "source", "notes", "category"]) {
    if (input[key] !== undefined) {
      updates[key] = key === "category" ? (input[key] as string).toLowerCase() : input[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return JSON.stringify({ error: "No fields to update. Provide at least one field to change." });
  }

  const { data, error } = await context.supabase
    .from("confirmed_dates")
    .update(updates)
    .eq("id", input.id as string)
    .eq("user_id", context.userId)
    .select("id, title")
    .maybeSingle();

  if (error) return JSON.stringify({ error: error.message });
  if (!data) return JSON.stringify({ error: `No confirmed date found with ID "${input.id}".` });
  return JSON.stringify({ success: true, id: data.id, title: data.title, updated_fields: Object.keys(updates) });
}

async function executeUpdateWatchlistItem(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["title", "type", "category", "notes", "status"]) {
    if (input[key] !== undefined) {
      updates[key] = key === "category" ? (input[key] as string).toLowerCase() : input[key];
    }
  }

  if (Object.keys(updates).length === 1) {
    return JSON.stringify({ error: "No fields to update. Provide at least one field to change." });
  }

  const { data, error } = await context.supabase
    .from("watchlist_items")
    .update(updates)
    .eq("id", input.id as string)
    .eq("user_id", context.userId)
    .select("id, title")
    .maybeSingle();

  if (error) return JSON.stringify({ error: error.message });
  if (!data) return JSON.stringify({ error: `No watchlist item found with ID "${input.id}".` });
  return JSON.stringify({
    success: true,
    id: data.id,
    title: data.title,
    updated_fields: Object.keys(updates).filter((k) => k !== "updated_at"),
  });
}

async function executeDeleteConfirmedDate(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const { data, error } = await context.supabase
    .from("confirmed_dates")
    .delete()
    .eq("id", input.id as string)
    .eq("user_id", context.userId)
    .select("id, title")
    .maybeSingle();

  if (error) return JSON.stringify({ error: error.message });
  if (!data) return JSON.stringify({ error: `No confirmed date found with ID "${input.id}".` });
  return JSON.stringify({ success: true, deleted: { id: data.id, title: data.title } });
}

async function executeDeleteWatchlistItem(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const { data, error } = await context.supabase
    .from("watchlist_items")
    .delete()
    .eq("id", input.id as string)
    .eq("user_id", context.userId)
    .select("id, title")
    .maybeSingle();

  if (error) return JSON.stringify({ error: error.message });
  if (!data) return JSON.stringify({ error: `No watchlist item found with ID "${input.id}".` });
  return JSON.stringify({ success: true, deleted: { id: data.id, title: data.title } });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "")
    .replace(/^-+/, "");
}
