---
status: pending
priority: p2
issue_id: "017"
tags: [code-review, performance]
dependencies: []
---

# Singleton Anthropic Client + Parallel Tool Execution

## Problem Statement

1. A new `Anthropic` client is created per request in both `loop.ts` and `search.ts`, discarding connection pools and forcing fresh TCP+TLS handshakes.
2. When Claude returns multiple tool_use blocks, they execute sequentially. Each `search_for_date` makes two serial API calls (Brave + Claude), so 3 searches = 9-18 seconds of sequential waiting.

## Findings

- **Performance Oracle** (Critical #1): Up to 11 clients per single user request in worst case
- **Performance Oracle** (Critical #2): Independent tool calls should use `Promise.all`
- Files: `backend/src/agent/loop.ts` (line 32, lines 115-147), `backend/src/search.ts` (line 50)

## Proposed Solutions

### Option A: Module-scope singleton + Promise.all for tools
- **Pros**: Reuses connections; parallel tool execution cuts latency dramatically
- **Cons**: Need AbortController for parallel abort handling
- **Effort**: Small-Medium
- **Risk**: Low

## Acceptance Criteria

- [ ] Single Anthropic client instance shared across requests
- [ ] Multiple tool calls in a single round execute in parallel
- [ ] Abort handling works correctly with parallel execution

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Connection pooling and parallelization are easy wins |
