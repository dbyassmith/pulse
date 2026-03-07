---
title: "Add Category Icons to Dates"
type: feat
status: completed
date: 2026-03-07
origin: docs/plans/2026-03-06-feat-add-categories-to-dates-and-watchlist-plan.md
---

# Add Category Icons to Dates

Add icons for each preset category, using platform-native icon libraries: SF Symbols on iOS and Lucide React on desktop.

## Category Icon Mapping

| Category        | SF Symbol (iOS)        | Lucide (Desktop)  |
|-----------------|------------------------|--------------------|
| `tech`          | `desktopcomputer`      | `Monitor`          |
| `sports`        | `sportscourt`          | `Trophy`           |
| `entertainment` | `film`                 | `Film`             |
| `gaming`        | `gamecontroller`       | `Gamepad2`         |
| `birthday`      | `birthday.cake`        | `Cake`             |
| `travel`        | `airplane`             | `Plane`            |
| `personal`      | `person`               | `User`             |
| `business`      | `briefcase`            | `Briefcase`        |
| `holiday`       | `star`                 | `Star`             |
| _(unknown)_     | `tag`                  | `Tag`              |

## Acceptance Criteria

### iOS (`ios/goldfish/goldfish/ContentView.swift`)

- [x] Add a helper function that maps a category string to an SF Symbol name
- [x] Show the icon next to the category badge in each date row
- [x] Fall back to `tag` for unrecognized categories

### Widget (`ios/goldfish/GoldfishWidget/GoldfishWidget.swift`)

- [x] Use the same mapping helper (shared via `Shared/` or inline)
- [x] Show category icon per row if space permits

### Desktop (`desktop/src/renderer/src/components/DatesList.tsx`)

- [x] Install `lucide-react` (`npm install lucide-react`)
- [x] Add a helper function that maps a category string to a Lucide icon component
- [x] Show the icon next to the date info in each row
- [x] Fall back to `Tag` for unrecognized categories

## Context

Categories are already stored as optional strings on `confirmed_dates` (see origin plan). This plan only adds visual icons — no data model changes needed.

## Sources

- Origin plan: [docs/plans/2026-03-06-feat-add-categories-to-dates-and-watchlist-plan.md](../plans/2026-03-06-feat-add-categories-to-dates-and-watchlist-plan.md)
- iOS list view: `ios/goldfish/goldfish/ContentView.swift`
- Desktop list: `desktop/src/renderer/src/components/DatesList.tsx`
- SF Symbols reference: developer.apple.com/sf-symbols
- Lucide React: lucide.dev
