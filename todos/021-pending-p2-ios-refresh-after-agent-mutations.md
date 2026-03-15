---
status: pending
priority: p2
issue_id: "021"
tags: [code-review, ios, ux]
dependencies: []
---

# iOS Doesn't Refresh After Agent Mutations

## Problem Statement

When the agent saves a date or adds a watchlist item, the iOS chat sheet dismisses back to `ContentView`, but there is no signal to reload data. The user must manually pull-to-refresh. The agent says "I saved NFL Draft 2026" but the date doesn't appear in the list.

## Findings

- **Architecture Strategist**: `ContentView` loads dates in `onAppear` but sheet dismiss doesn't trigger reload
- **Agent-Native Reviewer**: "Silent Actions" anti-pattern
- File: `ios/goldfish/goldfish/ContentView.swift`, lines 91-93 (sheet dismiss has no reload)

## Proposed Solutions

### Option A: Reload on sheet dismiss
- **Pros**: Simple, catches all agent mutations
- **Cons**: Reloads even when no changes were made
- **Effort**: Small
- **Risk**: None

```swift
.sheet(isPresented: $showChat, onDismiss: {
    Task { await loadDates() }
}) { chatSheet }
```

## Acceptance Criteria

- [ ] Upcoming dates list refreshes after chat sheet is dismissed
- [ ] Watchlist refreshes after chat sheet is dismissed

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from code review | Agent mutations must reflect in UI immediately |
