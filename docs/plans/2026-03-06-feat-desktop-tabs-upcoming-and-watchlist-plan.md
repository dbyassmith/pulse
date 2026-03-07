---
title: "feat: Add Upcoming Events and Watchlist tabs to desktop app"
type: feat
status: completed
date: 2026-03-06
---

# Add Upcoming Events and Watchlist Tabs to Desktop App

Add a tab bar to the Dashboard with two tabs: "Upcoming Events" (existing DatesList) and "Watchlist" (new component reading local markdown files from `agent/watchlist/`).

## Acceptance Criteria

- [x] Tab bar renders below the header with "Upcoming" and "Watchlist" tabs
- [x] "Upcoming" is the default active tab
- [x] Clicking a tab switches the visible content
- [x] Tab bar uses `WebkitAppRegion: 'no-drag'` so clicks work in frameless window
- [x] New `watchlist:list` IPC handler reads `.md` files from `{repoPath}/agent/watchlist/`
- [x] IPC handler parses YAML frontmatter and returns structured array
- [x] IPC handler handles gracefully: missing directory, empty directory, malformed files (skip them)
- [x] Preload bridge exposes `window.api.watchlist.list()` with TypeScript types
- [x] New `WatchlistList` component displays items with: title, category, type, added date
- [x] WatchlistList shows empty state: "No items being watched"
- [x] Both tabs refresh on app focus and after Claude task completion (existing `refreshKey` pattern)
- [x] Tab styling matches existing warm beige aesthetic (inline styles, no new dependencies)

## Context

### Files to modify

- `desktop/src/main/index.ts` -- add `watchlist:list` IPC handler that reads & parses watchlist markdown files
- `desktop/src/preload/index.ts` -- expose `watchlist.list()` on the bridge
- `desktop/src/preload/index.d.ts` -- add `WatchlistItem` type and `watchlist` to `GoldfishAPI`
- `desktop/src/renderer/src/components/Dashboard.tsx` -- add tab state, tab bar UI, conditionally render DatesList or WatchlistList
- `desktop/src/renderer/src/components/WatchlistList.tsx` -- new component (follow DatesList patterns)

### YAML parsing

Add `gray-matter` dependency to parse markdown frontmatter. It's the standard library for this and handles the `---` delimiters natively.

### WatchlistItem interface

```typescript
interface WatchlistItem {
  id: string
  title: string
  type: string // one-time, recurring-irregular, etc.
  category?: string
  added: string // YYYY-MM-DD
  confidence_threshold: string
  last_checked?: string
  notes?: string
}
```

### Display fields per row

Keep it simple like DatesList: **title** (primary), **category** badge (if present), **type** (secondary text), **added** date.

### Tab bar design

Simple text tabs with an underline indicator for the active tab, positioned directly below the header. Use existing color palette (`#1a1a1a` text, `#3498db` active indicator).

## MVP

### WatchlistList.tsx

```tsx
// Follow same pattern as DatesList.tsx
// Call window.api.watchlist.list() on mount
// Render list of WatchlistItem with title, category, type, added date
// Show "No items being watched" empty state
```

### Dashboard.tsx tab additions

```tsx
// Add state: const [activeTab, setActiveTab] = useState<'upcoming' | 'watchlist'>('upcoming')
// Render tab bar below header
// Conditionally render <DatesList /> or <WatchlistList /> based on activeTab
// Both components receive refreshKey for refresh-on-focus behavior
```

### main/index.ts IPC handler

```typescript
// ipcMain.handle('watchlist:list', async () => {
//   const config = readConfig()
//   const watchlistDir = path.join(config.repoPath, 'agent', 'watchlist')
//   Read all .md files, parse frontmatter with gray-matter, return items array
//   Handle: dir not found → empty array, malformed file → skip
// })
```

## Sources

- Existing component patterns: `desktop/src/renderer/src/components/DatesList.tsx`
- Watchlist file format: `agent/watchlist/nfl-falcons-2026-schedule-release.md`
- Related plan: `docs/plans/2026-03-06-feat-add-categories-to-dates-and-watchlist-plan.md`
