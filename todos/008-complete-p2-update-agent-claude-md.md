---
status: complete
priority: p2
issue_id: "008"
tags: [code-review, agent-native, documentation]
dependencies: []
---

# Add `agent/CLAUDE.md` to plan's modification list

## Problem Statement

The plan updates three slash commands but does not mention updating `agent/CLAUDE.md`, which is the agent's primary context document (208 lines). It currently documents `goldfish date add` as the resolution mechanism. After this change, it should document the new watchlist CLI commands.

## Findings

- **Agent-Native Reviewer**: "Add `agent/CLAUDE.md` to the 'Key Files to Modify' table. Replace the `goldfish date add` CLI reference section with a `goldfish watchlist` CLI reference section."

## Proposed Solutions

Add `agent/CLAUDE.md` to the Key Files to Modify table in the plan. During implementation, update the CLI reference section to document whichever watchlist commands are implemented.

- **Effort**: Small
- **Risk**: None

## Acceptance Criteria

- [ ] `agent/CLAUDE.md` listed in plan's Key Files to Modify
- [ ] Updated during implementation with new CLI command references

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-08 | Created from agent-native review | Agent context docs must stay in sync with CLI changes |
