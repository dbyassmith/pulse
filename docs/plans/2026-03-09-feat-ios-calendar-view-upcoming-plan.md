---
title: "feat: Add calendar month grid view to iOS Upcoming tab"
type: feat
status: active
date: 2026-03-09
---

# Add Calendar Month Grid View to iOS Upcoming Tab

Add a toggleable month-grid calendar view to the Upcoming tab in the iOS app. Users can switch between the existing list view and a new calendar view via a toolbar button. The calendar shows dot indicators on days with events, supports month navigation via swipe and arrow buttons, and filters the event list below when a day is tapped.

## Acceptance Criteria

- [ ] Toolbar toggle button (calendar/list icon) switches between list and calendar views
- [ ] Calendar grid shows a standard month layout with day numbers
- [ ] Days with events show an orange dot indicator below the day number
- [ ] Today is visually distinguished (orange text or circle)
- [ ] Leading/trailing days from adjacent months shown grayed out, non-interactive
- [ ] Swipe left/right on the calendar grid navigates between months
- [ ] Arrow buttons flanking the month/year header also navigate months
- [ ] Tapping a day with events highlights it and filters the event list below to that day only
- [ ] Tapping the selected day again deselects it, showing all events for the visible month
- [ ] Event list below calendar uses the same `dateRow` pattern (icon, title, date, days remaining)
- [ ] Tapping an event row navigates to EventDetailView (existing behavior)
- [ ] Swipe-to-delete works on event rows below the calendar
- [ ] Category filter menu still works in calendar view (filters both dots and list)
- [ ] Pull-to-refresh works by pulling on the event list below the calendar
- [ ] Calendar grid is pinned at the top; event list scrolls independently below
- [ ] Empty state: "No events this month" shown in list area when month has no events
- [ ] Calendar range: current month through 12 months ahead (matching existing data scope)
- [ ] Defaults to list view on launch (current behavior preserved)
- [ ] Follows existing styling: `Color("AppBackground")`, accent orange, consistent fonts

## Design Decisions

### Toolbar layout
The leading toolbar slot currently holds the category filter. Add the view toggle button **next to the filter icon** in the leading position. Both are small icon buttons, so they fit naturally.

```
[filter] [list/cal]    Goldfish    [gear]
```

When in calendar mode, show `list.bullet` icon. When in list mode, show `calendar` icon. This follows Apple's convention of showing the icon for the *other* view mode.

### Calendar grid
- Use `Calendar.current` for first weekday (respects locale)
- Single orange dot per day regardless of event count
- Today: day number rendered in orange accent color with a subtle circle background
- Selected day: filled orange circle behind the day number (white text)
- Days outside current month: light gray text, no tap action
- Day cells: ~44pt tap targets for comfortable tapping
- Month header: "March 2026" centered, with `chevron.left` / `chevron.right` buttons

### Scroll architecture
Calendar grid pinned at top in a `VStack`. Below it, a `List` (or `ScrollView`) for events. Only the event list scrolls. This prevents the calendar from scrolling off-screen and keeps month context visible.

### Month navigation boundaries
- Earliest: current month (no past months, consistent with `fetchAllUpcoming` returning dates >= today)
- Latest: 12 months from now (matching the existing `groupedDates` 12-month cutoff)
- Events in the "Future" bucket (beyond 12 months) are not visible in calendar view; they remain visible in list view

### Gesture scoping
- Horizontal swipe for month navigation applies **only** to the calendar grid area
- This avoids conflicts with swipe-to-delete on event rows and the system back gesture

### State on view toggle
- Switching from calendar to list: selected date is discarded, list shows all events
- Switching from list to calendar: calendar opens to the current month

### Deletion in calendar
- Deleting an event removes the row with animation and updates the calendar dot
- If the last event on the selected day is deleted, auto-deselect the day and show all month events
- Dot indicator disappears when a day has zero events (after filter/deletion)

### Unparseable dates
- Events with `parsedDate == nil` are excluded from calendar view (no grid position possible)
- They remain visible in list view as before

## Context

### Files to create

- `ios/goldfish/goldfish/CalendarGridView.swift` -- New component: month grid with navigation, dot indicators, day selection

### Files to modify

- `ios/goldfish/goldfish/ContentView.swift` -- Add `@State` for view mode toggle, toolbar button, conditional rendering of calendar vs list, shared filtering/deletion logic

### View hierarchy (calendar mode)

```
VStack(spacing: 0) {
    CalendarGridView(
        dates: filteredDates,
        selectedDay: $selectedDay,
        displayedMonth: $displayedMonth
    )

    // Event list for selected day or full month
    List {
        ForEach(visibleEvents) { date in
            dateRow(date)
                .swipeActions { ... }
        }
    }
    .refreshable { await loadDates() }
}
```

### CalendarGridView internals

The calendar grid is a pure SwiftUI view (no UIKit wrapping needed). Core logic:

```swift
struct CalendarGridView: View {
    let dates: [UpcomingDate]
    @Binding var selectedDay: DateComponents?
    @Binding var displayedMonth: Date

    private let calendar = Calendar.current
    private let columns = Array(repeating: GridItem(.flexible()), count: 7)

    // Computed: Set<DateComponents> of days that have events
    // Computed: grid of day cells for the displayed month
    // Gestures: DragGesture on the grid for swipe navigation
}
```

Key computations:
- `daysWithEvents`: a `Set<Int>` of day-of-month values that have at least one event in the displayed month
- `daysInMonth`: array of day cells including leading/trailing blanks for grid alignment
- Month change: add/subtract 1 month from `displayedMonth`, clamped to [today's month, today + 12 months]

### ContentView changes

```swift
// New state
@State private var viewMode: ViewMode = .list  // enum ViewMode { case list, calendar }
@State private var selectedDay: DateComponents?
@State private var displayedMonth = Date()

// Toolbar addition (leading, alongside filter)
Button {
    viewMode = viewMode == .list ? .calendar : .list
    if viewMode == .list { selectedDay = nil }
} label: {
    Image(systemName: viewMode == .list ? "calendar" : "list.bullet")
}

// Tab content changes
if viewMode == .list {
    // existing upcomingContent
} else {
    calendarContent  // new computed property
}
```

### Filtered events for calendar

```swift
private var calendarEvents: [UpcomingDate] {
    let cal = Calendar.current
    if let day = selectedDay, let dayDate = cal.date(from: day) {
        // Show only events on the selected day
        return filteredDates.filter { $0.parsedDate.map { cal.isDate($0, inSameDayAs: dayDate) } ?? false }
    } else {
        // Show all events in the displayed month
        return filteredDates.filter { date in
            guard let parsed = date.parsedDate else { return false }
            return cal.isDate(parsed, equalTo: displayedMonth, toGranularity: .month)
        }
    }
}
```

## Sources

- Existing component patterns: `ios/goldfish/goldfish/ContentView.swift` (upcomingContent, dateRow, toolbar)
- Data model: `ios/goldfish/Shared/UpcomingDate.swift` (parsedDate, categoryIcon)
- Related plan: `docs/plans/2026-03-06-feat-desktop-tabs-upcoming-and-watchlist-plan.md`
