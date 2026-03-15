---
status: ready
priority: p1
issue_id: "026"
tags: [code-review, security]
dependencies: []
---

# No Bounds Checking on limit/offset Parameters

## Problem Statement

`executeListConfirmedDates` and `executeListWatchlistItems` accept `limit` and `offset` from tool input with no upper bound or type validation. An attacker via prompt injection could set `limit: 1000000`, forcing Supabase to serialize a massive result set. Negative offsets produce undefined behavior. No validation that values are actually numbers.

## Findings

- **Security Sentinel** (High #3): No bounds on limit/offset enables DoS and data exfiltration
- File: `backend/src/agent/tool-executor.ts`, lines 116-117 and 142-143

## Proposed Solutions

### Option A: Clamp values (Recommended)
```typescript
const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);
const offset = Math.max(Number(input.offset) || 0, 0);
```
- **Pros**: Simple, prevents abuse
- **Cons**: None
- **Effort**: Small (2 lines per function)
- **Risk**: None

## Acceptance Criteria

- [ ] `limit` is clamped to 1-100 range
- [ ] `offset` is clamped to >= 0
- [ ] Non-numeric values fall back to defaults

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-15 | Created from CRUD tools review | Always validate pagination params |
