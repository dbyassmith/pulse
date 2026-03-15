---
status: ready
priority: p2
issue_id: "027"
tags: [code-review, quality, typescript]
dependencies: []
---

# Duplicated Delete and Update Executor Functions

## Problem Statement

`executeDeleteConfirmedDate` and `executeDeleteWatchlistItem` are identical except for the table name. Same for the two update functions (90% identical). The codebase already has `get_item_details` using a `table` parameter pattern, but delete and update don't follow it. ~63 LOC could be eliminated.

## Findings

- **Code Simplicity Reviewer**: Delete functions are character-for-character duplicates; update functions share 90% structure
- **TypeScript Reviewer** (Structural #4): Textbook case for shared helper
- File: `backend/src/agent/tool-executor.ts`, lines 180-277

## Proposed Solutions

### Option A: Unify delete into single tool + executor (Recommended)
Merge `delete_confirmed_date` and `delete_watchlist_item` into one `delete_item` tool with a `table` parameter, matching `get_item_details` pattern. Merge update executors into a parameterized helper.
- **Pros**: ~63 LOC saved, consistent API design, fewer bugs
- **Cons**: Requires updating tool definitions (schema change)
- **Effort**: Small-Medium
- **Risk**: Low

### Option B: Keep separate tools, share executor helper
Keep the two separate tool names (better for LLM clarity) but have them call a shared `executeDelete(table, input, context)` function.
- **Pros**: Simpler change, no schema change, still eliminates duplication
- **Cons**: 2 tool names for identical behavior
- **Effort**: Small
- **Risk**: None

## Acceptance Criteria

- [ ] No near-duplicate executor functions
- [ ] Delete behavior is identical for both tables
- [ ] Update behavior correctly handles `updated_at` for watchlist only

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-15 | Created from CRUD tools review | Follow existing `get_item_details` pattern for consistency |
