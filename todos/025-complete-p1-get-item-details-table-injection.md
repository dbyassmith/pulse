---
status: pending
priority: p1
issue_id: "025"
tags: [code-review, security]
dependencies: []
---

# get_item_details Passes Unvalidated Table Name to Supabase

## Problem Statement

`executeGetItemDetails` casts `input.table` as a TypeScript union type but performs no runtime validation. The `as` cast is erased at compile time. If the LLM is tricked via prompt injection into passing an arbitrary table name (e.g., `"auth.users"`), it gets forwarded directly to `supabase.from(table)`. While RLS should block unauthorized access, this relies entirely on RLS being correctly configured for every table.

## Findings

- **Security Sentinel** (High #2): Table name injection via `get_item_details`, no server-side validation
- **TypeScript Reviewer** (Critical #2): `as` cast does zero runtime validation on table name
- File: `backend/src/agent/tool-executor.ts`, line 168

## Proposed Solutions

### Option A: Runtime allowlist check (Recommended)
```typescript
const ALLOWED_TABLES = new Set(["confirmed_dates", "watchlist_items"]);
if (!ALLOWED_TABLES.has(input.table as string)) {
  return JSON.stringify({ error: "Invalid table" });
}
```
- **Pros**: Simple, zero-dependency, defense in depth
- **Cons**: None
- **Effort**: Small (2 lines)
- **Risk**: None

## Acceptance Criteria

- [ ] `get_item_details` rejects any table name not in the allowlist
- [ ] Returns a generic error (no schema info leaked)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-15 | Created from CRUD tools review | TypeScript `as` casts are not runtime checks |
