---
status: ready
priority: p2
issue_id: "028"
tags: [code-review, agent-native, ios]
dependencies: []
---

# Category List Mismatch Between iOS and Agent

## Problem Statement

The agent tool descriptions list 11 categories (including `politics` and `local`), while the iOS `EventDetailView` picker only offers 9 categories. Items the agent categorizes as `politics` or `local` become uneditable in the iOS category picker. The category list is repeated as a free-text string in 4+ tool descriptions with no shared constant.

## Findings

- **Agent-Native Reviewer** (Warning #1): Category list mismatch creates data inconsistency
- **TypeScript Reviewer** (Minor #10): Category enum is repeated as free-text in 4 tool descriptions
- Files: `backend/src/agent/tools.ts` (4 occurrences), `ios/goldfish/goldfish/EventDetailView.swift` line 18

## Proposed Solutions

### Option A: Add politics/local to iOS pickers (Recommended)
- **Pros**: Full consistency, agent-created items editable everywhere
- **Cons**: Requires iOS change + App Store update
- **Effort**: Small
- **Risk**: Low

### Option B: Extract category list as a constant in the backend
- **Pros**: Single source of truth for agent tools, easier to sync later
- **Cons**: Doesn't fix iOS mismatch by itself
- **Effort**: Small
- **Risk**: None

## Acceptance Criteria

- [ ] iOS and agent support the same category list
- [ ] Category list is defined once, not repeated across tool descriptions

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-15 | Created from CRUD tools review | Category lists diverge easily without a shared constant |
