---
status: pending
priority: p2
issue_id: "019"
tags: [code-review, agent-native, feature]
dependencies: []
---

# Agent Missing CRUD Tools (List, Delete, Update)

## Problem Statement

The agent can search, save dates, and create watchlist items -- but cannot list existing data, delete records, or update records. Only 3 of 7 user-facing capabilities are agent-accessible. The agent is effectively write-only and blind to existing state.

## Findings

- **Agent-Native Reviewer**: 4 capabilities lack agent tools:
  - `list_confirmed_dates` - Agent can't answer "what dates do I have?" or detect duplicates
  - `delete_confirmed_date` - User can swipe-to-delete in UI; agent cannot
  - `update_confirmed_date` - User can edit in EventDetailView; agent cannot
  - `list_watchlist_items` - Agent can't see watchlist state
- Also recommended: `remove_watchlist_item` (set status to inactive)
- Also recommended: Inject user state summary into system prompt for zero-round-trip context

## Proposed Solutions

### Option A: Add all missing tools
- **Pros**: Full agent-native parity
- **Cons**: More code in tools.ts and tool-executor.ts
- **Effort**: Medium
- **Risk**: Low

### Option B: Add list tools only (minimum viable)
- **Pros**: Agent can see state and avoid duplicates
- **Cons**: Still can't delete/update
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Agent can list confirmed dates with optional filters
- [ ] Agent can delete a confirmed date by ID
- [ ] Agent can update a confirmed date
- [ ] Agent can list watchlist items
- [ ] System prompt updated to reference new tools

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Agent-native score: 3/7 capabilities accessible |
