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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "")
    .replace(/^-+/, "");
}
