---
title: "feat: Edit Confirmed Dates from iOS Detail Page"
type: feat
status: completed
date: 2026-03-07
---

# feat: Edit Confirmed Dates from iOS Detail Page

Add inline editing to `EventDetailView` so users can modify all fields of a confirmed date (title, date, confidence, category, source, notes) and persist changes to Supabase.

## Acceptance Criteria

- [x] Detail page has an "Edit" button in the toolbar that toggles edit mode
- [x] In edit mode, each field becomes editable (text fields, date picker, picker for confidence/category)
- [x] A "Save" button persists changes to Supabase and updates the local list
- [x] A "Cancel" button discards changes and returns to view mode
- [x] Saving shows a brief loading indicator and handles errors with an alert
- [x] After saving, the parent list reflects the updated values without requiring a full refresh
- [x] Optional fields (source, notes) can be cleared or added
- [x] Date validation: cannot save an empty title or invalid date

## Technical Considerations

- `UpcomingDate` fields are currently `let` — need to either make them `var` or use a separate editable copy/state
- The `EventDetailView` currently takes `let date: UpcomingDate` — change to use a `@Binding` or callback pattern so the parent list updates
- `SupabaseService` needs a new `updateDate` method
- No existing update/upsert calls exist in the codebase — this is the first write-back from iOS

## MVP

### SupabaseService.swift — add `updateDate` method

```swift
func updateDate(_ date: UpcomingDate) async throws {
    try await client
        .from("confirmed_dates")
        .update([
            "title": date.title,
            "date": date.date,
            "confidence": date.confidence,
            "category": date.category as Any,
            "source": date.source as Any,
            "notes": date.notes as Any,
        ])
        .eq("id", value: date.id)
        .execute()
}
```

### Shared/UpcomingDate.swift — make fields mutable

Change `let` to `var` for editable fields:

```swift
struct UpcomingDate: Codable, Identifiable {
    let id: String
    var title: String
    var date: String
    var confidence: String
    var category: String?
    var source: String?
    var notes: String?
    var created_at: String?
    // ... computed properties unchanged
}
```

### EventDetailView.swift — add edit mode

- Add `@State private var isEditing = false`
- Add `@State private var editingDate: UpcomingDate` initialized from the passed-in date
- Add `var onUpdate: (UpcomingDate) -> Void` callback
- In edit mode, swap `DetailRow` for editable controls:
  - Title: `TextField`
  - Date: `DatePicker` (convert to/from `yyyy-MM-dd` string)
  - Confidence: `Picker` with options `["high", "medium", "low"]`
  - Category: `Picker` with options `["tech", "sports", "entertainment", "gaming", "birthday", "travel", "personal", "business", "holiday"]` plus nil
  - Source: `TextField` (optional)
  - Notes: `TextField` with `.lineLimit(3...)` (optional)
- Toolbar: "Edit" button toggles `isEditing`; in edit mode show "Cancel" (leading) and "Save" (trailing)
- Save calls `SupabaseService.shared.updateDate(editingDate)`, then `onUpdate(editingDate)` on success

### ContentView.swift — wire up onUpdate

Update `NavigationLink` to pass an `onUpdate` closure:

```swift
EventDetailView(date: date, onDelete: {
    Task { await deleteDate(date) }
}, onUpdate: { updated in
    if let idx = dates.firstIndex(where: { $0.id == updated.id }) {
        dates[idx] = updated
    }
    // Refresh widget data
    SharedDefaults.write(Array(dates.prefix(4)))
    WidgetCenter.shared.reloadAllTimelines()
})
```

## Sources

- EventDetailView: `ios/goldfish/goldfish/EventDetailView.swift`
- UpcomingDate model: `ios/goldfish/Shared/UpcomingDate.swift`
- Supabase service: `ios/goldfish/goldfish/SupabaseService.swift`
- Table schema: `docs/solutions/integration-issues/supabase-cli-date-management.md` (columns: id, user_id, title, date, confidence, category, source, notes, group_id, group_index, created_at)
- ContentView navigation: `ios/goldfish/goldfish/ContentView.swift:27`
