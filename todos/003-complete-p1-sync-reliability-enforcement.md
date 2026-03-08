---
status: complete
priority: p1
issue_id: "003"
tags: [code-review, agent-native, reliability]
dependencies: []
---

# Enforce sync reliability in two-step file-then-database flow

## Problem Statement

The plan's core architecture is: agent writes a file, then calls `goldfish watchlist sync --file`. Nothing enforces step 2. The agent may forget, hit an error, or be interrupted. Additionally, `/pls-run` Pass 2 (requeue) creates new files without any sync call, and `last_checked` updates are not synced.

## Findings

- **Agent-Native Reviewer**: "Two-step write-then-sync is unreliable without enforcement. Database becomes stale. Desktop and iOS show incomplete data."
- **Agent-Native Reviewer**: "Requeue pass creates new watchlist files without syncing."
- **Architecture Strategist**: "`/pls-run` updates `last_checked` on non-resolved items without a corresponding sync call."

## Proposed Solutions

### Option A: Add `sync --all` sweep command (Recommended)
- Add `goldfish watchlist sync --dir agent/watchlist/` that scans all `.md` files and upserts each
- Call at the end of every `/pls-run` invocation as a safety net
- Catches missed individual syncs, requeued items, and last_checked updates
- **Pros**: Single safety net covers all gaps, simple to implement
- **Cons**: Slightly more work per run (reads all files)
- **Effort**: Small
- **Risk**: Low

### Option B: Make slash commands enforce sync with imperative language
- In each command: "You MUST run sync immediately after writing. Do not proceed until sync succeeds."
- Add sync calls after every file write in all three commands including requeue
- **Pros**: No extra CLI work
- **Cons**: Agent compliance depends on prompt wording, still fragile
- **Effort**: Small
- **Risk**: Medium (agent may still miss)

### Option C: Combine A + B
- Add `sync --all` as safety net AND tighten slash command instructions
- **Pros**: Defense in depth
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] All file-write paths in agent commands have corresponding sync calls
- [ ] Requeue pass (Pass 2) syncs newly created files
- [ ] A mechanism exists to repair drift (manual or automatic)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from agent-native and architecture reviews | The two-step pattern is the plan's biggest reliability risk |
