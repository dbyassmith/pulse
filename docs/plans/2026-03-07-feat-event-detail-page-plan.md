---
title: "feat: Add Event Detail Page to iOS App"
type: feat
status: completed
date: 2026-03-07
---

# feat: Add Event Detail Page to iOS App

Tapping an event in the list pushes a detail view showing all available fields for that event. Uses NavigationLink push (consistent with existing Settings navigation pattern). Extra fields (`source`, `notes`, `created_at`) are fetched from Supabase and displayed when available.

## Acceptance Criteria

- [x] Tapping a list row in ContentView pushes an `EventDetailView`
- [x] Detail view shows: title, full formatted date, days remaining, category, confidence, source, notes, created_at
- [x] Nil optional fields are hidden (not shown with "None" placeholder)
- [x] Detail view has a Delete button with the same confirmation dialog pattern as the list
- [x] After deleting from detail view, user is popped back to the list and the item is removed
- [x] Background matches the app's warm beige (`Color(red: 0xF8/255, green: 0xED/255, blue: 0xD9/255)`)
- [x] Swipe-to-delete on list rows still works alongside the new NavigationLink tap target
- [x] Widget data (`SharedDefaults`) remains backward-compatible after model changes

## MVP

### Shared/UpcomingDate.swift (changes)

Add optional fields for the extra database columns. Since they're optional, existing cached widget data (which lacks these fields) will still decode correctly.

```swift
struct UpcomingDate: Codable, Identifiable {
    let id: String
    let title: String
    let date: String
    let confidence: String
    let category: String?
    let source: String?      // NEW
    let notes: String?        // NEW
    let created_at: String?   // NEW

    // ... existing computed properties unchanged ...

    // NEW: long date format for detail view
    private static let longFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEEE, MMMM d, yyyy"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    var longDisplayDate: String {
        guard let parsed = parsedDate else { return date }
        return Self.longFormatter.string(from: parsed)
    }
}
```

### goldfish/SupabaseService.swift (changes)

Update `fetchAllUpcoming()` select clause to include the new fields:

```swift
.select("id, title, date, confidence, category, source, notes, created_at")
```

Leave `fetchWidgetDates()` unchanged (widget doesn't need extra fields).

### goldfish/EventDetailView.swift (new file)

```swift
import SwiftUI

struct EventDetailView: View {
    let date: UpcomingDate
    var onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteAlert = false

    private let bgColor = Color(red: 0xF8/255, green: 0xED/255, blue: 0xD9/255)

    var body: some View {
        List {
            Section {
                Text(date.title)
                    .font(.title2.bold())
                    .listRowBackground(bgColor)
                    .listRowSeparator(.hidden)
            }

            Section {
                DetailRow(label: "Date", value: date.longDisplayDate)
                DetailRow(label: "Countdown", value: date.daysRemainingText)
                if let category = date.category {
                    DetailRow(label: "Category", value: category.capitalized)
                }
                DetailRow(label: "Confidence", value: date.confidence.capitalized)
            }
            .listRowBackground(bgColor)

            if date.source != nil || date.notes != nil {
                Section {
                    if let source = date.source {
                        DetailRow(label: "Source", value: source)
                    }
                    if let notes = date.notes {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Notes")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(notes)
                                .font(.body)
                        }
                    }
                }
                .listRowBackground(bgColor)
            }

            Section {
                Button(role: .destructive) {
                    showDeleteAlert = true
                } label: {
                    Text("Delete Event")
                        .frame(maxWidth: .infinity)
                }
            }
            .listRowBackground(bgColor)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(bgColor)
        .navigationTitle("Details")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Delete \"\(date.title)\"?",
            isPresented: $showDeleteAlert,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                onDelete()
                dismiss()
            }
        } message: {
            Text("This will be permanently removed.")
        }
    }
}

private struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.body)
        }
    }
}
```

### goldfish/ContentView.swift (changes)

Wrap each list row in a `NavigationLink`:

```swift
List(dates) { date in
    NavigationLink {
        EventDetailView(date: date) {
            Task { await deleteDate(date) }
        }
    } label: {
        HStack {
            VStack(alignment: .leading) {
                Text(date.title)
                    .font(.body)
                HStack(spacing: 6) {
                    Text(date.displayDate)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let category = date.category {
                        Text(category.uppercased())
                            .font(.caption2)
                            .fontWeight(.medium)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(.quaternary)
                            .clipShape(Capsule())
                    }
                }
            }
            Spacer()
            Text(date.daysRemainingText)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }
    // ... existing listRowInsets, listRowBackground, swipeActions unchanged
}
```

## Sources

- ContentView pattern: `ios/goldfish/goldfish/ContentView.swift`
- UpcomingDate model: `ios/goldfish/Shared/UpcomingDate.swift`
- Supabase queries: `ios/goldfish/goldfish/SupabaseService.swift:42`
- Table schema: `docs/solutions/integration-issues/supabase-cli-date-management.md` (columns: id, user_id, title, date, confidence, source, notes, group_id, group_index, created_at)
- Settings push navigation pattern: `ios/goldfish/goldfish/ContentView.swift:79`
