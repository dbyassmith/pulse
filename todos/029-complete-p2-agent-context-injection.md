---
status: ready
priority: p2
issue_id: "029"
tags: [code-review, agent-native, performance]
dependencies: []
---

# Agent Has No Awareness of User Data at Conversation Start

## Problem Statement

When a user opens chat and says "delete the NFL Draft," the agent must first call `list_confirmed_dates`, scan results, find the ID, then call `delete_confirmed_date` -- wasting a full LLM round-trip out of the MAX_TOOL_ROUNDS=10 budget. The agent starts every conversation blind to the user's existing data.

## Findings

- **Agent-Native Reviewer** (Critical #1): Context starvation; agent has zero awareness of existing items
- The system prompt already injects today's date dynamically -- extend this pattern to include a data summary

## Proposed Solutions

### Option A: Inject slim data summary into system prompt (Recommended)
At request time in `loop.ts`, query the user's item counts and next ~5 upcoming dates. Append to the system prompt:
```
You currently have 12 confirmed dates (3 tech, 5 sports, ...) and 4 active watchlist items.
Next upcoming: NFL Draft 2026 (Apr 25), WWDC 2026 (Jun 9), ...
```
- **Pros**: Agent can answer "what's next?" without tool calls; saves round-trips for delete/update
- **Cons**: Adds 1 Supabase query per chat request; stale if user modifies mid-conversation
- **Effort**: Medium
- **Risk**: Low

## Acceptance Criteria

- [ ] Agent system prompt includes a summary of user's current data
- [ ] Summary is generated per-request from Supabase
- [ ] Agent can reference existing items without calling list tools first

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-15 | Created from CRUD tools review | Context injection reduces tool round-trips significantly |
