# Pulse Agent System

An automated date monitoring agent that watches for event date announcements, confirms them via web search, submits confirmed dates to the Pulse database, and requeues recurring events.

## Workflow Overview

1. **Watch** (`/pls-watch`) — User describes an event to monitor. The agent creates a watchlist file with search queries and confirmation criteria.
2. **Run** (`/pls-run`) — Agent searches the web for each watchlist item, resolves confirmed dates via `pulse date add`, requeues recurring events, and logs results.
3. **Search** (`/pls-search`) — One-shot lookup for a single event (lives at repo root `.claude/commands/pls-search.md`).

## Folder Structure

```
agent/
  watchlist/              # Active items being monitored
  resolved/
    confirmed/            # Resolved items (submitted to database)
  logs/                   # Per-run summaries (YYYY-MM-DD-HHMMSS.md)
  CLAUDE.md               # This file — agent context
  .claude/
    commands/
      pls-watch.md        # Conversational intake command
      pls-run.md          # Full daily workflow trigger
```

## Watchlist File Format

Each file is `agent/watchlist/<id>.md` with YAML frontmatter:

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

### Required Fields

| Field | Description |
|-------|-------------|
| `title` | Human-readable event name |
| `id` | URL-safe slug (lowercase, hyphens, no special chars) |
| `type` | One of the event types below |
| `added` | Date the item was added (YYYY-MM-DD) |
| `confidence_threshold` | Minimum confidence to resolve: `high`, `medium`, or `low` |
| `search_queries` | List of 2-4 web search queries to try |
| `confirmed_when` | Plain English criteria for what counts as confirmation |

### Optional Fields

| Field | Description |
|-------|-------------|
| `last_checked` | Date of most recent search (YYYY-MM-DD) |
| `notes` | Free-text context from the user |
| `parent_id` | For requeued items, links to the resolved parent |
| `date_estimate` | Rough expected date (for recurring-predictable) |

### Resolved File Additions

When a file moves to `agent/resolved/confirmed/`, these fields are appended:

| Field | Description |
|-------|-------------|
| `resolved_date` | The confirmed date (YYYY-MM-DD) |
| `resolved_on` | When it was resolved (YYYY-MM-DD) |
| `resolved_confidence` | The confidence level of the match |
| `resolved_source` | Source URL |

## Event Types

| Type | Description | Requeue Behavior |
|------|-------------|-----------------|
| `one-time` | Happens once (product launch, single conference) | Archive after date passes. Done. |
| `recurring-irregular` | Repeats but dates vary year to year (WWDC, Google I/O) | After date passes, spawn next year's entry in watchlist |
| `recurring-predictable` | Repeats on a known schedule (e.g., "first Tuesday of November") | After date passes, spawn next occurrence with `date_estimate` |
| `series` | Multi-part events (F1 season, concert tour dates) | After each date passes, spawn entry for the next event in the series |
| `category-watch` | Ongoing category (e.g., "next Apple event") | Spawn fresh entry immediately on confirmation, don't wait for date to pass |

## Confidence Model

Three tiers matching the `pulse date add` confidence flag:

| Level | Meaning | Source Examples |
|-------|---------|----------------|
| `high` | Official/first-party source confirms a specific date | Company website, official blog, press release |
| `medium` | Reputable press reports a specific date | The Verge, TechCrunch, Bloomberg, Reuters |
| `low` | Rumors, leaks, unnamed sources | Reddit, Twitter leaks, fan sites |

### Resolution Logic

An item resolves when the **search confidence meets or exceeds** the item's `confidence_threshold`:

- Item threshold `high` — only resolves on `high` confidence finds
- Item threshold `medium` — resolves on `high` or `medium`
- Item threshold `low` — resolves on any confidence level

**Never resolve if:**
- The search only returns a month without a specific day
- The date is clearly speculative ("expected to be around...")
- The event appears to be cancelled

## pulse date add CLI Reference

```bash
pulse date add \
  --id "<slugified-title>" \
  --title "<event title>" \
  --date "<YYYY-MM-DD>" \
  --confidence "<high|medium|low>" \
  --source "<source-url>" \
  --notes "<brief summary of findings>"
```

### Flag Details

| Flag | Required | Description |
|------|----------|-------------|
| `--id` | Optional | URL-safe slug. Auto-generated UUID if omitted. |
| `--title` | Required | Human-readable event name |
| `--date` | Required | Date in YYYY-MM-DD format |
| `--confidence` | Required | `high`, `medium`, or `low` |
| `--source` | Optional | URL where the date was found |
| `--notes` | Optional | Brief context about the finding |

### ID Slugification Rules

- Lowercase the title
- Replace spaces and special characters with hyphens
- Strip trailing hyphens
- Examples: "WWDC 2026" -> `wwdc-2026`, "iPhone 17 Launch" -> `iphone-17-launch`

**Quote all flag values that contain spaces.**

### Prerequisites

The CLI requires authentication. Run `pulse auth login` before first use. Session persists in `~/.pulse/session.json`.

## Requeue Rules (Detailed)

### one-time
No action needed after date passes. The file stays in `resolved/confirmed/` as an archive.

### recurring-irregular
1. Increment the year in both `title` and `id` (e.g., "WWDC 2026" -> "WWDC 2027", `wwdc-2026` -> `wwdc-2027`)
2. Update `search_queries` to reference the new year
3. Update `confirmed_when` if it references a specific year
4. Set `parent_id` to the resolved item's `id`
5. Set `added` to today's date
6. Clear any resolution metadata
7. Write to `agent/watchlist/<new-id>.md`

### recurring-predictable
Same as recurring-irregular, plus:
- Include `date_estimate` based on the known pattern (e.g., if 2026 was June 9, estimate 2027 as "early June 2027")

### series
1. Determine the next event in the series
2. Create a new watchlist entry for that specific event
3. Update title, id, and search queries for the next instance
4. Set `parent_id` to the resolved item's `id`

### category-watch
- Spawns a fresh entry **immediately when resolved** (during the research pass, not the requeue pass)
- The new entry goes straight to `agent/watchlist/` with refreshed search queries
- Example: "next Apple event" resolves to "WWDC 2026" -> immediately spawn a new "next Apple event" watch

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No search results | Log "no results" for that item, continue to next |
| Multiple conflicting dates | Use the most authoritative source; note conflict in logs |
| Event cancelled | Log the cancellation, leave in watchlist with a note |
| Only a month found (no day) | Do NOT resolve — not specific enough |
| Speculative date ("expected around...") | Do NOT resolve — treat as low confidence |
| Empty watchlist | Log "no items to check", skip research pass |
| Empty resolved folder | Log "no items to requeue", skip requeue pass |
| Network/search failure | Log the error for that item, continue with others |
