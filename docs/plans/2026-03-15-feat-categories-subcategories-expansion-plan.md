---
title: "feat: Add politics/local categories and freeform subcategory support"
type: feat
status: active
date: 2026-03-15
---

# Add Politics/Local Categories and Freeform Subcategory Support

## Overview

Expand the Goldfish category system with two new preset categories ("politics" and "local") and add freeform subcategory support. Subcategories are agent-inferred, stored in a new nullable `subcategory` column on both `confirmed_dates` and `watchlist_items` tables, and displayed across iOS and desktop clients.

## Problem Statement / Motivation

The current 9 preset categories don't cover common event types like political events (elections, debates, legislation deadlines) or local events (city council meetings, local festivals, community events). Additionally, categories are too broad -- "tech" encompasses everything from WWDC to a startup launch. Subcategories provide finer-grained classification without breaking the existing category model.

## Proposed Solution

1. **Add "politics" and "local" to all preset category locations** (11 locations identified)
2. **Add a nullable `subcategory` text column** to both Supabase tables
3. **Agent infers freeform subcategory** guided by examples in the system prompt
4. **Normalize subcategory** with `.toLowerCase().trim()`, same as category
5. **Display subcategory** in iOS/desktop as secondary text; edit via free-text field on iOS
6. **Propagate subcategory** through all write paths: agent chat, CLI, watchlist sync, watchlist resolve

## Technical Considerations

### All Locations Requiring Category List Update (11 total)

| # | File | What to change |
|---|------|----------------|
| 1 | `backend/src/agent/system-prompt.ts:24` | Add politics, local to text list |
| 2 | `backend/src/agent/tools.ts:51` | `add_confirmed_date` category description |
| 3 | `backend/src/agent/tools.ts:83` | `create_watchlist_item` category description |
| 4 | `agent/CLAUDE.md:73-83` | Preset Categories table |
| 5 | `.claude/commands/pls-search.md:17` | Category list in search instructions |
| 6 | `.claude/commands/pls-search.md:33` | Category list in watchlist fallback |
| 7 | `cli/src/commands/date.ts:61` | `--category` option help text |
| 8 | `ios/goldfish/goldfish/EventDetailView.swift:18-20` | Category picker array |
| 9 | `ios/goldfish/goldfish/WatchlistDetailView.swift:18-20` | Category picker array |
| 10 | `ios/goldfish/Shared/UpcomingDate.swift:70-83` | `iconForCategory` switch statement |
| 11 | `desktop/src/renderer/src/components/DatesList.tsx:16-26` | `categoryIcons` Lucide mapping |

### Database Migration

Add nullable `subcategory` text column to both tables via Supabase SQL editor:

```sql
ALTER TABLE confirmed_dates ADD COLUMN subcategory text;
ALTER TABLE watchlist_items ADD COLUMN subcategory text;
```

No backfill needed -- existing rows get `null` subcategory, which is valid.

### Icon Assignments

| Category | SF Symbol (iOS) | Lucide (Desktop) |
|----------|----------------|-------------------|
| politics | `building.columns` | `Landmark` |
| local | `mappin.and.ellipse` | `MapPin` |

### Subcategory Normalization

Apply `.toLowerCase().trim()` in every write path, same as existing category handling. No length limit enforced at DB level for v1, but system prompt guidance keeps values short (1-2 words).

### System Prompt Subcategory Guidance

Add to `system-prompt.ts` after the category list. Include 2-3 example subcategories per category to anchor agent behavior:

```
Subcategory: optionally set a short, lowercase subcategory to refine the category. Examples:
- tech: ai, apple, google, crypto, developer-conference
- sports: nfl, nba, soccer, olympics, formula-1
- entertainment: movies, tv, music, awards, theater
- gaming: playstation, xbox, nintendo, pc, esports
- politics: elections, legislation, policy, supreme-court, international
- local: community, city-council, festival, school, neighborhood
- travel: flights, hotels, road-trip, visa
- business: earnings, ipo, acquisition, conference
- holiday: federal, religious, cultural
- birthday: family, friend, colleague
- personal: health, finance, milestone
```

### Subcategory in Agent File-Based Workflow

Update these files to include subcategory:
- `agent/CLAUDE.md` -- add `subcategory` to the watchlist frontmatter format
- `.claude/commands/pls-watch.md` -- include subcategory in the template
- `.claude/commands/pls-search.md` -- pass `--subcategory` in `goldfish date add` calls
- `.claude/commands/pls-run.md` -- pass `--subcategory` in resolved date additions
- `cli/src/commands/watchlist.ts` `parseWatchlistFile` -- extract subcategory from frontmatter

### Watchlist Resolve Category Propagation (Bug Fix)

Currently `goldfish watchlist resolve` does not carry over category from the watchlist item to the confirmed date. Fix this: fetch the watchlist item's category and subcategory, use them as defaults for the confirmed date insert (overridable by explicit `--category`/`--subcategory` flags).

### iOS Display

- **List rows**: Show subcategory as secondary label after category (e.g., "Sports -- NFL")
- **Detail views**: Show subcategory as a separate row below category
- **Edit mode**: Free-text `TextField` for subcategory (not a picker, since freeform)
- **Widget**: Add `subcategory` as optional property to `UpcomingDate` struct but do not display in widget. `Codable` handles nil gracefully.
- **Filters**: v1 filters by category only, not subcategory

### Desktop Display

- Show subcategory as secondary text in list item badges (e.g., "Sports / NFL")
- No edit flow exists on desktop (pre-existing limitation)

## Acceptance Criteria

- [x] "politics" and "local" appear in all 11 category locations
- [ ] `subcategory` column exists on both `confirmed_dates` and `watchlist_items`
- [x] Agent chat infers and saves subcategory when obvious, null otherwise
- [x] CLI `date add` accepts `--subcategory` flag
- [x] CLI `add-batch` accepts `subcategory` in JSON entries
- [x] CLI `watchlist sync` reads subcategory from frontmatter
- [x] CLI `watchlist resolve` propagates category + subcategory from watchlist item to confirmed date
- [x] iOS displays subcategory in list rows and detail views
- [x] iOS edit views allow setting/changing subcategory via text field
- [x] iOS shows correct icons for politics (`building.columns`) and local (`mappin.and.ellipse`)
- [x] Desktop shows correct icons for politics (`Landmark`) and local (`MapPin`)
- [x] Desktop displays subcategory in list items
- [x] Subcategory values are lowercased and trimmed on all write paths
- [x] Agent CLAUDE.md and all slash commands updated with subcategory support

## Success Metrics

- New categories and subcategories appear correctly in agent-added dates
- No data loss when resolving watchlist items to confirmed dates
- Existing data continues to display correctly (null subcategory is handled gracefully)

## Dependencies & Risks

- **Supabase migration must happen first** -- all code changes depend on the column existing
- **11 locations to update** -- high risk of missing one; verify with grep for the old category list after implementation
- **Subcategory vocabulary drift** -- mitigated by system prompt examples but not enforced. Monitor over time and consider canonicalization if needed.
- **iOS `SharedDefaults` encoding** -- adding optional `subcategory` to `UpcomingDate` struct must remain backward-compatible with cached widget data. Optional properties decode as `nil` from old data, so this is safe.

## Sources & References

- Existing category plan: `docs/plans/2026-03-06-feat-add-categories-to-dates-and-watchlist-plan.md`
- Category icon mapping: `ios/goldfish/Shared/UpcomingDate.swift:70-83`
- Tool definitions: `backend/src/agent/tools.ts:51,83`
- System prompt: `backend/src/agent/system-prompt.ts:24`
- Watchlist parser: `cli/src/commands/watchlist.ts`
