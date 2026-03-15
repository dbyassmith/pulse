---
status: pending
priority: p2
issue_id: "018"
tags: [code-review, security, data-integrity]
dependencies: []
---

# Slug-Based IDs Risk Collisions

## Problem Statement

Primary keys are derived from `slugify(title)`. Two events with similar titles produce the same slug and collide. `create_watchlist_item` has no UUID fallback (unlike `add_confirmed_date`). Empty or non-Latin titles produce empty slugs.

## Findings

- **Security Sentinel** (H2): Cross-user collisions possible depending on DB constraints; within-user collisions on similar titles
- **Architecture Strategist**: Inconsistent fallback behavior between the two tools
- **Code Simplicity Reviewer**: `slugify` + UUID fallback is unnecessarily complex; just use UUIDs
- File: `backend/src/agent/tool-executor.ts`, lines 35-39, 65-69, 96-102

## Proposed Solutions

### Option A: Always use UUIDs, remove slugify
- **Pros**: No collisions; simpler code; removes ~7 lines
- **Cons**: IDs less human-readable (irrelevant for PKs)
- **Effort**: Small
- **Risk**: None

## Acceptance Criteria

- [ ] Both tools use `crypto.randomUUID()` for primary keys
- [ ] `slugify` function removed
- [ ] No empty-string ID risk

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Slugs as PKs are fragile; use UUIDs |
