---
title: "feat: Add list, update, and delete tools to conversational agent"
type: feat
status: completed
date: 2026-03-15
---

# feat: Add list, update, and delete tools to conversational agent

## Overview

The Goldfish conversational agent currently supports three tools: `search_for_date`, `add_confirmed_date`, and `create_watchlist_item`. This is write-only -- users cannot view, modify, or remove their data through the chat interface. This plan adds seven new tools for full CRUD coverage: list, get details, update, and delete for both confirmed dates and watchlist items.

## Problem Statement / Motivation

Users interacting with Goldfish through chat (iOS or future clients) cannot:
- See what dates or watchlist items they already have
- Correct mistakes (wrong date, typo in title, wrong category)
- Remove events they no longer care about
- Filter their data by category

This forces users to leave the chat and use the iOS app directly for any read/update/delete operation, breaking the conversational flow.

## Proposed Solution

Add seven new agent tools following the existing pattern in `tools.ts` / `tool-executor.ts`:

| Tool | Table | Operation | Returns |
|------|-------|-----------|---------|
| `list_confirmed_dates` | confirmed_dates | SELECT slim | id, title, date, category |
| `list_watchlist_items` | watchlist_items | SELECT slim | id, title, category, status |
| `get_item_details` | either | SELECT by id | Full record |
| `update_confirmed_date` | confirmed_dates | UPDATE by id | Updated fields |
| `update_watchlist_item` | watchlist_items | UPDATE by id | Updated fields |
| `delete_confirmed_date` | confirmed_dates | DELETE by id | Confirmation |
| `delete_watchlist_item` | watchlist_items | DELETE by id | Confirmation |

### Two-Tier Read Strategy

**List tools return slim data** to protect the context window:
- `list_confirmed_dates` returns: `id`, `title`, `date`, `category`
- `list_watchlist_items` returns: `id`, `title`, `category`, `status`

**`get_item_details` returns the full record** when the agent needs more info (e.g., before updating, or when the user asks "tell me more about X"). Accepts a `table` and `id` parameter.

This keeps list responses lightweight (~30-40 tokens per item vs ~100-150 for full records) while still giving the agent access to all fields when needed.

### ID-Based Update/Delete

Since the agent will have IDs from the list results, update and delete tools take an `id` parameter directly. No fuzzy title lookup needed -- the flow is:

1. User: "show me my dates"
2. Agent calls `list_confirmed_dates` -> gets IDs
3. User: "delete the NFL Draft one"
4. Agent knows the ID from the list, calls `delete_confirmed_date` with that ID

For cases where the user asks to update/delete without listing first, the agent can call list first in one tool round, then act in the next.

### Delete Semantics

**Hard delete** for both tables, matching the iOS client behavior (`SupabaseService.swift` lines 118-132). The `watchlist_items.status = "removed"` value exists but is unused across all clients -- we stay consistent.

### List Limits

Default limit of **25 items** per list call, with total count returned. The agent can page through with an `offset` parameter if the user asks for more.

### Partial Updates

Update tools accept only the fields to change. The executor builds an `update()` payload from only the provided fields, preventing accidental nullification of existing data.

## Technical Considerations

### Architecture

All changes are in `backend/src/agent/`:
- `tools.ts` -- add 7 new tool definitions to `TOOL_DEFINITIONS` array
- `tool-executor.ts` -- add 7 new executor functions
- `system-prompt.ts` -- update to describe new capabilities and behavioral rules

No new files, no new dependencies, no schema changes.

### Key Implementation Details

**Slim list select** -- only fetch needed columns:

```typescript
// tool-executor.ts
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
```

**Get item details** -- single tool for both tables:

```typescript
// tool-executor.ts
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
```

**ID-based update** -- partial fields only, verifies row exists:

```typescript
// tool-executor.ts
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
```

### Performance Implications

- Slim list queries select only 4 columns, reducing payload size by ~60% vs `select("*")`.
- All queries scoped by `user_id` (indexed via RLS policy). Category filter is sequential within user's rows -- acceptable for personal use (< 500 rows per user).
- The 25-item default limit prevents context window bloat.

### Security Considerations

- All queries scoped by `user_id` from the authenticated Supabase session -- no cross-user data access.
- Update/delete by ID + user_id prevents IDOR attacks even if an attacker guesses an ID.
- Delete operations are irreversible -- the system prompt instructs the agent to always confirm with the user before deleting.

## System-Wide Impact

### System Prompt Updates

The system prompt (`system-prompt.ts`) needs these additions:

```
## What You Do (updated)

4. **List items** -- When a user asks what dates or watchlist items they have, list them. Summarize conversationally.
5. **Examine items** -- Use get_item_details to see all fields of a specific item before updating, or when the user wants details.
6. **Update items** -- When a user wants to change details of an existing date or watchlist item, update it by ID.
7. **Delete items** -- When a user wants to remove a date or watchlist item, delete it after confirming.

## List/Update/Delete Rules

- Always confirm before deleting: "I'll remove [title] from your [dates/watchlist]. Go ahead?"
- When a user wants to update or delete, list items first if you don't already have the ID from context.
- When a user re-searches an event that already has a saved date, offer to update the existing entry rather than creating a duplicate.
- When listing items, summarize them naturally. Don't dump raw data.
- After listing items, offer: "Want to update or remove any of these?"
```

### iOS Client Impact

None. The iOS client communicates with the agent via SSE streaming (`/chat` endpoint). The new tools execute server-side; the agent's text responses flow through existing SSE events. No client changes needed.

### API Surface Parity

The iOS app can already list/update/delete via direct Supabase calls in `SupabaseService.swift`. These new agent tools bring the chat interface to parity.

## Acceptance Criteria

### List Tools
- [x] `list_confirmed_dates` returns slim data: id, title, date, category
- [x] `list_confirmed_dates` returns future dates sorted by date ascending, with total count
- [x] `list_confirmed_dates` accepts optional `category` filter and `include_past` flag
- [x] `list_watchlist_items` returns slim data: id, title, category, status
- [x] `list_watchlist_items` returns active items sorted by added date descending, with total count
- [x] `list_watchlist_items` accepts optional `category` and `status` filters
- [x] Both list tools default to 25 items with offset-based pagination

### Get Details Tool
- [x] `get_item_details` accepts `table` (confirmed_dates or watchlist_items) and `id`
- [x] Returns the full record for the matching item
- [x] Returns error if item not found or belongs to another user

### Update Tools
- [x] `update_confirmed_date` takes `id` + partial fields, updates only provided fields
- [x] `update_watchlist_item` takes `id` + partial fields, updates only provided fields and sets `updated_at`
- [x] Both return error if no fields provided
- [x] Both scope by user_id for security

### Delete Tools
- [x] `delete_confirmed_date` hard deletes by id + user_id
- [x] `delete_watchlist_item` hard deletes by id + user_id
- [x] Agent always asks for user confirmation before calling delete tools (system prompt enforced)

### System Prompt
- [x] Updated to describe all new capabilities
- [x] Includes delete confirmation rule
- [x] Includes list-then-act guidance for update/delete
- [x] Includes re-search-then-update guidance (avoid duplicates)
- [x] Includes conversational presentation guidance for lists

### General
- [x] All 7 new tools registered in `TOOL_DEFINITIONS` array
- [x] All 7 new tools handled in `executeTool` switch statement
- [x] No new files created -- all changes in existing agent files

## Success Metrics

- Users can perform full CRUD through chat without leaving to the iOS app
- No duplicate confirmed dates created when re-searching existing events
- List responses stay lightweight (slim fields only)

## Dependencies & Risks

**Dependencies**: None. All changes are backend-only in existing files. No schema changes, no new packages.

**Risks**:
- **Grouped confirmed dates**: Multi-day events stored with `group_id` will appear as separate items in list results. For now, these are treated independently. Low risk since most dates are single-day.
- **Context window with many list calls**: A user listing items repeatedly could fill the conversation context. Mitigation: slim list data + 25-item default limit.
- **Agent needing two rounds for update/delete**: When the user asks to delete without listing first, the agent must list->identify->delete, costing 2 tool rounds out of the MAX_TOOL_ROUNDS=10 budget. Acceptable tradeoff for the simpler ID-based approach.

## MVP

### tools.ts (7 new tool definitions added to TOOL_DEFINITIONS array)

```typescript
// List tools
{
  name: "list_confirmed_dates",
  description: "List the user's saved confirmed dates. Returns slim data (id, title, date, category) for upcoming dates by default. Use get_item_details to see full info on a specific item.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: { type: "string", description: "Filter by category: tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday" },
      include_past: { type: "boolean", description: "Include past dates (default: false)" },
      limit: { type: "number", description: "Max items to return (default: 25)" },
      offset: { type: "number", description: "Skip this many items for pagination" },
    },
    required: [],
  },
},
{
  name: "list_watchlist_items",
  description: "List the user's watchlist items. Returns slim data (id, title, category, status) for active items by default. Use get_item_details to see full info on a specific item.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: { type: "string", description: "Filter by category: tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday" },
      status: { type: "string", enum: ["active", "resolved", "removed"], description: "Filter by status (default: active)" },
      limit: { type: "number", description: "Max items to return (default: 25)" },
      offset: { type: "number", description: "Skip this many items for pagination" },
    },
    required: [],
  },
},

// Detail tool
{
  name: "get_item_details",
  description: "Get full details for a specific confirmed date or watchlist item by ID. Use after listing to examine a particular item.",
  input_schema: {
    type: "object" as const,
    properties: {
      table: { type: "string", enum: ["confirmed_dates", "watchlist_items"], description: "Which table to look up" },
      id: { type: "string", description: "The item ID (from list results)" },
    },
    required: ["table", "id"],
  },
},

// Update tools
{
  name: "update_confirmed_date",
  description: "Update an existing confirmed date by ID. Only provide the fields you want to change.",
  input_schema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "The confirmed date ID (from list results)" },
      title: { type: "string", description: "New title for the event" },
      date: { type: "string", description: "New date in YYYY-MM-DD format" },
      confidence: { type: "string", enum: ["high", "medium", "low"], description: "New confidence level" },
      source: { type: "string", description: "New source URL" },
      notes: { type: "string", description: "New notes" },
      category: { type: "string", description: "New category" },
    },
    required: ["id"],
  },
},
{
  name: "update_watchlist_item",
  description: "Update an existing watchlist item by ID. Only provide the fields you want to change.",
  input_schema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "The watchlist item ID (from list results)" },
      title: { type: "string", description: "New title for the item" },
      type: { type: "string", enum: ["one-time", "recurring-irregular", "recurring-predictable", "series", "category-watch"], description: "New event type" },
      category: { type: "string", description: "New category" },
      notes: { type: "string", description: "New notes" },
      status: { type: "string", enum: ["active", "resolved", "removed"], description: "New status" },
    },
    required: ["id"],
  },
},

// Delete tools
{
  name: "delete_confirmed_date",
  description: "Permanently delete a confirmed date by ID. Always confirm with the user before calling this tool.",
  input_schema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "The confirmed date ID to delete" },
    },
    required: ["id"],
  },
},
{
  name: "delete_watchlist_item",
  description: "Permanently delete a watchlist item by ID. Always confirm with the user before calling this tool.",
  input_schema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "The watchlist item ID to delete" },
    },
    required: ["id"],
  },
},
```

### tool-executor.ts (new executor functions + updated switch)

```typescript
// Add to executeTool switch statement:
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

// List confirmed dates (slim: id, title, date, category)
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

// List watchlist items (slim: id, title, category, status)
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

// Get full details for a single item
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

// Update confirmed date (partial, by ID, verifies row exists)
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

// Update watchlist item (partial, by ID, verifies row exists)
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

// Delete confirmed date (hard delete by ID, verifies row exists)
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

// Delete watchlist item (hard delete by ID, verifies row exists)
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
```

### system-prompt.ts (additions to SYSTEM_PROMPT)

```
## What You Do (add items 4-7)

4. **List items** -- When a user asks what dates or watchlist items they have, list them. Summarize conversationally.
5. **Examine items** -- Use get_item_details to see all fields of a specific item before updating, or when the user wants more details.
6. **Update items** -- When a user wants to change details of an existing date or watchlist item, update it by ID.
7. **Delete items** -- When a user wants to remove a date or watchlist item, delete it after confirming with the user.

## List/Update/Delete Rules

- Always confirm before deleting: "I'll remove [title] from your [dates/watchlist]. Go ahead?"
- When a user wants to update or delete, list items first if you don't already have the ID from conversation context.
- When a user re-searches an event that already has a saved date, offer to update the existing entry rather than creating a duplicate.
- When listing items, summarize them naturally. Don't dump raw data.
- After listing items, offer: "Want to update or remove any of these?"
```

## Sources & References

- Existing tool pattern: `backend/src/agent/tools.ts` and `backend/src/agent/tool-executor.ts`
- iOS CRUD reference: `ios/goldfish/goldfish/SupabaseService.swift` (hard delete pattern, query filters, sort orders)
- Agent loop constraints: `backend/src/agent/loop.ts` (max_tokens=2048, MAX_TOOL_ROUNDS=10)
- Institutional learning: `docs/solutions/integration-issues/supabase-cli-date-management.md` (RLS enforcement, validation patterns)
