---
title: Add Category Filters to Watchlist Tab
type: feat
status: active
date: 2026-03-09
---

# Add Category Filters to Watchlist Tab

Add the same category filter menu to the Watchlist tab that already exists for Upcoming dates, so users can filter watchlist items by category.

## Acceptance Criteria

- [x] Filter menu icon appears in the top-left toolbar when Watchlist tab is selected
- [x] Menu lists "All" plus categories dynamically derived from loaded watchlist items
- [x] Each category shows its SF Symbol icon (reuses `UpcomingDate.iconForCategory`)
- [x] Active filter shows checkmark and filled filter icon
- [x] Filtered empty state shows "No [Category] Items" with appropriate message
- [x] Filter resets when switching tabs (or persists — either is fine)

## Implementation

The challenge is that `WatchlistView` is embedded inside `ContentView`'s `NavigationStack`, so the toolbar is controlled by `ContentView`. Two options:

**Option A (Recommended): Lift watchlist state to ContentView**
Mirror the pattern used for upcoming dates — move `items` state and loading into `ContentView`, pass filtered items down to `WatchlistView` as a parameter.

**Option B: Expose filter menu from WatchlistView via callback**
Keep items in `WatchlistView`, expose available categories via a binding/callback so `ContentView` can render the toolbar menu.

Option A is simpler and consistent with how upcoming dates already work.

### Changes

#### `ContentView.swift`

- Add `@State private var watchlistItems: [WatchlistItem] = []`
- Add `@State private var selectedWatchlistCategory: String?`
- Add `availableWatchlistCategories` computed property (same pattern as `availableCategories`)
- Add `filteredWatchlistItems` computed property
- Update toolbar: show `watchlistFilterMenu` when `selectedTab == 1`
- Add `watchlistFilterMenu` (clone of `filterMenu` using watchlist state)
- Load watchlist items in `loadDates()` or a new `loadWatchlistItems()` method
- Pass `filteredWatchlistItems` to `WatchlistView(items:)`

#### `WatchlistView.swift`

- Change from self-loading to accepting items as a parameter: `let items: [WatchlistItem]`
- Remove `@State private var items`, `isLoading`, error state
- Remove `loadItems()`, `.onAppear`, `.refreshable`, `.alert`
- Keep `watchlistRow(_:)` and layout (list, empty state)
- Accept `selectedCategory: String?` to customize empty state message
- Pull-to-refresh moves to ContentView's responsibility

## Context

- Existing filter pattern: `ContentView.swift:12-25` (state), `ContentView.swift:213-241` (menu)
- Category icon mapping: `Shared/UpcomingDate.swift:70-83` (`iconForCategory`)
- WatchlistView: `WatchlistView.swift` (current standalone implementation)
- Both models share the same category vocabulary defined in `backend/src/agent/tools.ts`
