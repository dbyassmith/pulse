---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, architecture, database]
dependencies: ["001"]
---

# Address non-atomic multi-table write in resolve flow

## Problem Statement

Whether resolve is a single CLI command or two separate calls (date add + sync), the two Supabase writes (insert confirmed_dates + update watchlist_items) are not atomic. If one succeeds and the other fails, the system is inconsistent.

## Findings

- **Architecture Strategist**: "If the first succeeds and the second fails, the system is inconsistent."
- **Security Sentinel**: "Consider a Supabase RPC function for transactional guarantees."

## Proposed Solutions

### Option A: Order writes, accept partial failure (Recommended for MVP)
- Insert `confirmed_dates` first (the higher-value write)
- Then update `watchlist_items` status
- If second write fails, log warning; the date is saved (what matters most)
- Agent can re-sync the watchlist file to repair
- **Effort**: Small
- **Risk**: Low (acceptable for personal app)

### Option B: Supabase RPC function
- Create a PostgreSQL function that performs both writes in a single transaction
- **Effort**: Medium
- **Risk**: Low but adds server-side dependency

### Option C: Idempotent design
- Use `ON CONFLICT` for confirmed_dates insert, check status before resolving
- Makes re-running resolve safe and self-healing
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Write ordering documented and implemented
- [ ] Failure of second write does not block the user-facing outcome

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from architecture + security reviews | For personal app, ordering + idempotency > full transactions |
