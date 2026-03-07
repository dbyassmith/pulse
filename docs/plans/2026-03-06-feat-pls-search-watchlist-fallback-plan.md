---
title: "feat: Add watchlist fallback to pls-search when no date found"
type: feat
status: completed
date: 2026-03-06
---

# feat: Add watchlist fallback to pls-search when no date found

## Overview

When `/pls-search` can't find a confirmed date for an event, it currently dead-ends with a suggestion to search manually. Instead, it should automatically create a watchlist item so `/pls-run` picks it up on future runs.

## Problem Statement

The current `/pls-search` flow has a gap: if a date isn't found today, the user has to remember to either search again later or manually run `/pls-watch` to set up monitoring. This defeats the purpose of the agent system — the user asked about an event, we should keep looking for them.

## Proposed Solution

Modify `.claude/commands/pls-search.md` to add a fallback step after step 4 (the "no date found" path). When no confirmed date is found, the command should:

1. Inform the user that no confirmed date was found yet
2. Automatically infer watchlist fields from the search context (reusing the same logic as `/pls-watch`)
3. Create a watchlist file at `agent/watchlist/<id>.md`
4. Confirm what was created and that `/pls-run` will monitor it going forward

## Acceptance Criteria

- [x] When `/pls-search` finds a confirmed date, behavior is unchanged (run `goldfish date add`, done)
- [x] When `/pls-search` does NOT find a confirmed date, it creates a watchlist file at `agent/watchlist/<id>.md`
- [x] The watchlist file uses the same YAML frontmatter format as `/pls-watch` (title, id, type, added, confidence_threshold, search_queries, confirmed_when)
- [x] The search queries in the watchlist file are informed by what was already searched (not just copied — refined based on what didn't work)
- [x] The user is told: (a) no date was found, (b) a watchlist item was created, (c) `/pls-run` will check for it on future runs
- [x] No duplicate watchlist items: if `agent/watchlist/<id>.md` already exists, inform the user it's already being watched instead of creating a duplicate

## Context

### Files to modify

- `.claude/commands/pls-search.md` — the only file that needs changes

### Reference files (read-only, for patterns)

- `.claude/commands/pls-watch.md` — watchlist file format and field inference logic
- `agent/CLAUDE.md` — watchlist file format spec, event types, confidence model

### What changes in pls-search.md

Replace step 4:

**Current step 4:**
> If no confirmed date can be found, say so clearly and do NOT run the command. Suggest what the user might search for manually.

**New step 4:**
> If no confirmed date can be found:
> 1. Tell the user no confirmed date was found yet
> 2. Infer watchlist fields from the event description (same logic as `/pls-watch` step 1):
>    - **title** — clean event name from the search context
>    - **id** — slugified title
>    - **type** — infer event type (one-time, recurring-irregular, etc.)
>    - **search_queries** — 2-4 refined queries based on what was already searched
>    - **confirmed_when** — criteria for what counts as confirmation
>    - **confidence_threshold** — default `medium`
> 3. Check if `agent/watchlist/<id>.md` already exists. If so, tell the user it's already being monitored and skip creation.
> 4. Write the watchlist file to `agent/watchlist/<id>.md`
> 5. Confirm: "No confirmed date yet. I've added this to your watchlist — `/pls-run` will check for it on future runs."

## MVP

### .claude/commands/pls-search.md

The updated step 4 section (replacing lines 24-25 of the current file):

```markdown
4. **If no confirmed date can be found**, do NOT run the `goldfish date add` command. Instead, create a watchlist item for ongoing monitoring:

   a. Tell the user: "No confirmed date found yet for [event]."

   b. Infer watchlist fields from the event description:
      - **title** — Clean, human-readable event name
      - **id** — Slugified title (lowercase, hyphens, no special chars)
      - **type** — One of: `one-time`, `recurring-irregular`, `recurring-predictable`, `series`, `category-watch`
      - **search_queries** — 2-4 refined web search queries (improve on what was already tried)
      - **confirmed_when** — Plain English criteria for what counts as a confirmed date
      - **confidence_threshold** — Default to `medium`

   c. Check if `agent/watchlist/<id>.md` already exists. If it does, tell the user: "This event is already on your watchlist." and stop.

   d. Write the watchlist file to `agent/watchlist/<id>.md`:

      ```yaml
      ---
      title: "<title>"
      id: "<id>"
      type: <type>
      added: <today's date YYYY-MM-DD>
      confidence_threshold: <confidence_threshold>
      search_queries:
        - "<query 1>"
        - "<query 2>"
        - "<query 3 if useful>"
      confirmed_when: >
        <Plain English description of what constitutes a confirmed date>
      ---
      ```

   e. Confirm to the user:
      - What watchlist item was created and where
      - That `/pls-run` will automatically check for this date on future runs
```
