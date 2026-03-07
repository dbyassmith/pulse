---
title: "Add Categories to Dates and Watchlist"
type: feat
status: active
date: 2026-03-06
---

# Add Categories to Dates and Watchlist

## Overview

Add a `category` field to confirmed dates and watchlist items so events can be organized by type. Includes preset categories with the freedom for the agent to create new ones on the fly.

## Problem Statement / Motivation

All dates currently exist in a flat list with no way to filter or group them. As the watchlist grows with a mix of tech events, sports, entertainment, and personal dates, it becomes harder to scan and find what you care about.

## Proposed Solution

Add an optional `category` string field across all layers of Goldfish:

**Preset categories:**
- `tech` — Apple events, developer conferences, product launches
- `sports` — NFL, NBA, F1, tournaments, drafts
- `entertainment` — Movies, TV shows, concerts, festivals
- `gaming` — Game releases, gaming events, E3/TGA
- `birthday` — Birthdays and anniversaries
- `travel` — Trips, flights, travel-related dates
- `personal` — Other personal milestones and deadlines
- `business` — Earnings, industry events, business deadlines
- `holiday` — Public holidays, observances

The agent can create new categories beyond these presets when an event doesn't fit. Categories are freeform strings — no enum enforcement at the database level.

## Technical Considerations

- **Backwards compatibility:** The field is nullable/optional everywhere. Existing dates and watchlist items continue to work without a category.
- **No enum constraint:** Categories are stored as plain strings. Presets are documented conventions, not enforced values. This lets the agent create categories like `space` or `politics` when needed.
- **Single category per item:** Keeps the data model simple. No join tables or arrays needed.

## Acceptance Criteria

### Supabase

- [ ] Add `category` column (type `text`, nullable) to `confirmed_dates` table (manual — run migration SQL)
- [x] Provide the migration SQL in the plan for manual execution

### CLI (`cli/src/commands/date.ts`)

- [x] Add `--category <text>` optional flag to `goldfish date add`
- [x] Add `category` field support to `goldfish date add-batch` JSON entries
- [x] Pass `category` through to the Supabase insert
- [x] Update `DateEntry` interface to include optional `category`

### Agent Watchlist (`agent/CLAUDE.md`, `agent/.claude/commands/pls-watch.md`)

- [x] Add optional `category` field to watchlist YAML frontmatter spec
- [x] Document preset categories in `agent/CLAUDE.md`
- [x] Update `pls-watch.md` to infer category from the user's description
- [x] Update `goldfish date add` CLI reference in `agent/CLAUDE.md` to include `--category`

### Agent Workflow

- [x] When resolving a watchlist item, pass the item's `category` to `goldfish date add --category`
- [x] When creating requeued items, carry forward the `category` from the parent

### iOS App

- [x] Add `category` field to `UpcomingDate` struct (`ios/goldfish/Shared/UpcomingDate.swift`)
- [x] Include `category` in Supabase select queries (`SupabaseService.swift`)
- [x] Display category as a subtle label/badge in the date list (`ContentView.swift`)
- [ ] Optionally group or filter by category in the list view

### Widget (`ios/goldfish/GoldfishWidget/GoldfishWidget.swift`)

- [x] Update sample data to include categories
- [ ] Optionally show a small category indicator per row (if space permits in `.systemMedium`)

### Desktop (`desktop/`) — if applicable

- [ ] Include category in any date display (follow same pattern as iOS)

## MVP

The core change is small: add a string column, thread it through the CLI, and teach the agent about it.

### migration.sql

```sql
ALTER TABLE confirmed_dates ADD COLUMN category text;
```

### cli/src/commands/date.ts (changes)

```typescript
// Add to DateEntry interface
interface DateEntry {
  title: string;
  date: string;
  confidence: string;
  source?: string;
  notes?: string;
  id?: string;
  category?: string;  // NEW
}

// Add flag to "add" command
.option("--category <text>", "Category (e.g. tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday)")

// Include in insert object
category: opts.category ?? null,

// Include in batch insert rows
category: entry.category ?? null,
```

### ios/goldfish/Shared/UpcomingDate.swift (changes)

```swift
struct UpcomingDate: Codable, Identifiable {
    let id: String
    let title: String
    let date: String
    let confidence: String
    let category: String?  // NEW
    // ... existing computed properties unchanged
}
```

### ios/goldfish/goldfish/SupabaseService.swift (changes)

```swift
// Update select queries to include category
.select("id, title, date, confidence, category")
```

### agent/CLAUDE.md (additions to watchlist format)

```yaml
---
title: WWDC 2026
id: wwdc-2026
type: recurring-irregular
category: tech          # NEW - optional
added: 2026-03-06
# ... rest unchanged
---
```

### agent/.claude/commands/pls-watch.md (additions)

```markdown
- **category** — One of the preset categories: tech, sports, entertainment, gaming, birthday, travel, personal, business, holiday. If the event doesn't fit a preset, create a short, lowercase, single-word category. Infer from context — don't ask the user unless truly ambiguous.
```

## Sources

- CLI date command: `cli/src/commands/date.ts`
- Agent CLAUDE.md: `agent/CLAUDE.md`
- Watch command: `agent/.claude/commands/pls-watch.md`
- iOS model: `ios/goldfish/Shared/UpcomingDate.swift`
- iOS service: `ios/goldfish/goldfish/SupabaseService.swift`
- iOS list view: `ios/goldfish/goldfish/ContentView.swift`
- Widget: `ios/goldfish/GoldfishWidget/GoldfishWidget.swift`
