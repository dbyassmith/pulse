---
title: "feat: Build agent watchlist system for automated date monitoring"
type: feat
status: active
date: 2026-03-06
---

# Build Agent Watchlist System for Automated Date Monitoring

## Overview

Extend the existing `/pls-search` one-shot date lookup into a full agent system that monitors events over time. Users describe what they want to track in plain English; the agent maintains a watchlist, periodically searches the web for confirmed dates, resolves matches via `pulse date add`, and automatically requeues recurring events.

## Problem Statement

`/pls-search` works well for one-off lookups, but many events (WWDC, product launches, conference dates) aren't announced yet when you first care about them. Users need a "set and forget" system that keeps checking until a date is confirmed, then handles the lifecycle (resolve, archive, or requeue for next occurrence).

## Proposed Solution

A file-based agent system inside `agent/` using Claude Code slash commands. No new code — just markdown files, YAML frontmatter conventions, and two slash commands that orchestrate web searches and CLI calls.

### Folder Structure

```
agent/
  watchlist/           # Active items being monitored (markdown + YAML frontmatter)
  resolved/
    confirmed/         # Items that matched and were submitted via pulse date add
  logs/                # Per-run summaries (YYYY-MM-DD-HHMMSS.md)
  CLAUDE.md            # Full workflow context for the agent
  .claude/
    commands/
      pls-search.md    # (already exists at repo root — DO NOT TOUCH)
      pls-watch.md     # Conversational intake for new watchlist items
      pls-run.md       # Manual trigger for the full daily workflow
```

**Note:** `pls-search.md` lives at the repo-root `.claude/commands/pls-search.md` and is not duplicated into `agent/.claude/commands/`.

## Event Types

| Type | Description | Requeue behavior |
|------|-------------|-----------------|
| `one-time` | Happens once, never again | Archive after date passes — done |
| `recurring-irregular` | Repeats but dates vary (WWDC, Google I/O) | After date passes, spawn next year's entry in watchlist |
| `recurring-predictable` | Repeats on a known schedule (e.g., "first Tuesday of November") | After date passes, spawn next occurrence with pre-filled date estimate |
| `series` | Multi-part events (e.g., "F1 2026 season" with many race dates) | After each date passes, spawn entry for next event in series |
| `category-watch` | Ongoing category monitoring (e.g., "next Apple event") | Spawn fresh entry immediately on confirmation, don't wait for date to pass |

## Watchlist File Format

Each file in `agent/watchlist/` is `<id>.md`:

```yaml
---
title: WWDC 2026
id: wwdc-2026
type: recurring-irregular
added: 2026-03-06
confidence_threshold: medium
search_queries:
  - "WWDC 2026 date announced"
  - "Apple developer conference 2026 schedule"
confirmed_when: >
  Apple officially announces WWDC 2026 dates on apple.com or the Apple Developer
  site, OR major tech press reports a confirmed date with a specific day.
---
```

### Optional fields

- `last_checked: YYYY-MM-DD` — updated each run to avoid redundant searches
- `notes:` — free-text context the user provided
- `parent_id:` — for requeued items, links back to the resolved parent
- `date_estimate:` — rough expected date (for recurring-predictable)

## Confidence Model

Three tiers matching the existing `pulse date add` confidence flag:

| Level | Meaning | Action |
|-------|---------|--------|
| `high` | Official/first-party source confirms a specific date | Resolve immediately |
| `medium` | Reputable press reports a specific date | Resolve if item's `confidence_threshold` is `medium` or `low` |
| `low` | Rumors, leaks, unnamed sources | Log the finding but do NOT resolve unless threshold is `low` |

An item resolves when the search confidence **meets or exceeds** the item's `confidence_threshold`.

## Slash Commands

### /pls-watch — Conversational Intake

**File:** `agent/.claude/commands/pls-watch.md`

Behavior:
1. Accept `$ARGUMENTS` as plain English description of what to monitor
2. Infer: event type, title, id (slugified), search queries (2-4), confirmed_when criteria
3. Ask clarifying questions only if genuinely ambiguous (e.g., "Is this a one-time event or does it recur annually?")
4. Set sensible defaults: `confidence_threshold: medium`, `added: today's date`
5. Write the completed file to `agent/watchlist/<id>.md`
6. Confirm to the user what was created and summarize the watch criteria

The user should never need to know about frontmatter fields or event type taxonomy — the agent handles classification.

### /pls-run — Full Daily Workflow

**File:** `agent/.claude/commands/pls-run.md`

Two-pass execution:

#### Pass 1: Research

For each file in `agent/watchlist/`:
1. Read the frontmatter
2. Run WebSearch using each `search_queries[]` entry
3. Evaluate results against `confirmed_when` criteria
4. Assign confidence level (high/medium/low)
5. **If confidence >= confidence_threshold:**
   - Call `pulse date add` with all flags
   - Move file to `agent/resolved/confirmed/<id>.md`
   - Append resolution metadata to frontmatter: `resolved_date`, `resolved_confidence`, `resolved_source`
6. **If confidence < threshold:**
   - Log what was found (date rumor, source, confidence) but leave file in watchlist
   - Optionally update `last_checked` in frontmatter

#### Pass 2: Requeue

For each file in `agent/resolved/confirmed/`:
1. Read frontmatter — check if the confirmed date has passed (compare to today)
2. If date has NOT passed: skip
3. If date HAS passed, act by type:
   - **one-time:** Move to `agent/resolved/confirmed/` (already there — no further action, it's archived)
   - **recurring-irregular:** Create new watchlist entry for next occurrence (increment year in title/id, reset search queries for new year, clear resolution metadata)
   - **recurring-predictable:** Same as irregular but include `date_estimate` based on known pattern
   - **series:** Create entry for next event in series (update title/id for next instance)
   - **category-watch:** Already handled — new entry was spawned at resolution time, not at date-passed time
4. For category-watch: this type spawns during Pass 1 (at resolution time), not Pass 2

#### Logging

After both passes, write a summary to `agent/logs/YYYY-MM-DD-HHMMSS.md`:

```markdown
# Agent Run: 2026-03-06 14:30:00

## Research Pass
- **wwdc-2026**: Searched 2 queries. Found confirmed date (2026-06-09) from apple.com. Confidence: high. RESOLVED.
- **iphone-18-launch**: Searched 2 queries. Rumor of September 2026 from leaker. Confidence: low. Left in watchlist.

## Requeue Pass
- **google-io-2025**: Date passed (2025-05-20). Type: recurring-irregular. Spawned google-io-2026 in watchlist.

## Summary
- Items searched: 2
- Resolved: 1
- Left in place: 1
- Requeued: 1
```

## agent/CLAUDE.md

This file gives the agent full context on every run. Contents:

1. **Workflow overview** — what the agent does and why
2. **Folder structure** — what lives where
3. **Watchlist file format** — complete YAML frontmatter spec with all fields
4. **Event types** — table with descriptions and requeue behavior
5. **Confidence model** — the three-tier system and resolution logic
6. **pulse date add CLI reference** — exact command format, all flags, ID slugification rules, quoting rules
7. **Requeue rules** — detailed per-type behavior
8. **Edge cases** — what to do when searches return nothing, when multiple dates are found, when an event is cancelled

## Acceptance Criteria

- [x] `agent/watchlist/` directory exists
- [x] `agent/resolved/confirmed/` directory exists
- [x] `agent/logs/` directory exists
- [x] `agent/CLAUDE.md` exists with complete workflow documentation
- [x] `agent/.claude/commands/pls-watch.md` exists and handles conversational intake
- [x] `agent/.claude/commands/pls-run.md` exists and runs both research and requeue passes
- [ ] `/pls-watch "WWDC 2026"` creates a well-formed watchlist file without user knowing about types/frontmatter
- [ ] `/pls-run` searches all watchlist items, resolves matches, requeues past events, and writes a log
- [ ] Existing `/pls-search` at repo root `.claude/commands/` is untouched
- [ ] Confidence comparison logic: item resolves when search confidence >= item's confidence_threshold
- [ ] Requeue spawns correct next entry per event type
- [ ] category-watch spawns immediately on resolution (Pass 1), not on date-passed (Pass 2)
- [ ] Log files capture what was searched, what was resolved, and what was left

## Edge Cases to Handle

1. **No results found for any query** — log "no results" and move on; don't error out
2. **Multiple conflicting dates found** — pick the one from the most authoritative source; note the conflict in logs
3. **Event cancelled** — if search clearly indicates cancellation, note in logs and leave in watchlist with a `status: cancelled-check` note (don't auto-resolve)
4. **Watchlist is empty** — log "no items to check" and skip research pass
5. **Resolved folder is empty** — log "no items to requeue" and skip requeue pass
6. **Same event resolved twice** — the file-move approach prevents this (file is no longer in watchlist after first resolution)
7. **Date format edge cases** — always use YYYY-MM-DD; if a search returns only a month, do NOT resolve (not specific enough)
8. **Network/search failures** — log the error for that item and continue with remaining items

## Files to Create

| File | Purpose |
|------|---------|
| `agent/watchlist/.gitkeep` | Preserve empty directory in git |
| `agent/resolved/confirmed/.gitkeep` | Preserve empty directory in git |
| `agent/logs/.gitkeep` | Preserve empty directory in git |
| `agent/CLAUDE.md` | Full agent context document |
| `agent/.claude/commands/pls-watch.md` | Conversational watchlist intake command |
| `agent/.claude/commands/pls-run.md` | Full daily workflow trigger command |

## Sources

- Existing slash command: `.claude/commands/pls-search.md`
- CLI documentation: `docs/solutions/integration-issues/supabase-cli-date-management.md`
- CLI source: `cli/src/commands/date.ts`
- Previous plan: `docs/plans/2026-03-06-feat-pls-search-slash-command-plan.md`
