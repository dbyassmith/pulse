---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, architecture, simplicity]
dependencies: []
---

# Drop `list` command from MVP; keep sync, resolve, remove

## Problem Statement

The plan proposes 4 CLI commands but `goldfish watchlist list` has no current consumer. Desktop and iOS query Supabase directly. The agent reads files from disk. Users view watchlist via apps or filesystem.

## Findings

- **Simplicity Reviewer**: `list` command is low-value for MVP — desktop queries Supabase directly, agent reads files.
- **User triage decision**: Keep `sync`, `resolve`, and `remove`. Drop `list`. Users see watchlist via the app, desktop app, or filesystem directly.

## Recommended Action

Update plan to remove `list` command. Update acceptance criteria and implementation order accordingly.

## Technical Details

- **Affected files**: Plan document, `cli/src/commands/watchlist.ts` (less code to write)

## Acceptance Criteria

- [ ] Plan updated to remove `list` command
- [ ] Acceptance criteria updated
- [ ] Implementation order updated

## Work Log

### 2026-03-08 - Approved for Work
**By:** User triage
**Actions:**
- Original finding was to reduce to single `sync` command
- User decided: keep sync + resolve + remove, drop list only
- Status changed from pending → ready

**Learnings:**
- Users view watchlist via apps or filesystem, no CLI list needed for MVP

## Resources

- Plan: `docs/plans/2026-03-08-feat-watchlist-database-sync-plan.md`
- Existing CLI pattern: `cli/src/commands/date.ts`
