import WidgetKit
import SwiftUI

struct UpcomingEntry: TimelineEntry {
    let date: Date
    let upcomingDates: [UpcomingDate]
    let isDarkMode: Bool
    let showDate: Bool
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> UpcomingEntry {
        UpcomingEntry(date: Date(), upcomingDates: Self.sampleDates, isDarkMode: false, showDate: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (UpcomingEntry) -> Void) {
        let dates = context.isPreview ? Self.sampleDates : SharedDefaults.read()
        let isDark = SharedDefaults.widgetDarkMode
        let showDate = SharedDefaults.widgetShowDate
        completion(UpcomingEntry(date: Date(), upcomingDates: dates, isDarkMode: isDark, showDate: showDate))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UpcomingEntry>) -> Void) {
        let dates = SharedDefaults.read()
        let isDark = SharedDefaults.widgetDarkMode
        let showDate = SharedDefaults.widgetShowDate
        var entries: [UpcomingEntry] = []

        entries.append(UpcomingEntry(date: Date(), upcomingDates: dates, isDarkMode: isDark, showDate: showDate))

        if let midnight = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 0),
            matchingPolicy: .nextTime
        ) {
            entries.append(UpcomingEntry(date: midnight, upcomingDates: dates, isDarkMode: isDark, showDate: showDate))
        }

        let tomorrow9am = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 9),
            matchingPolicy: .nextTime
        ) ?? Calendar.current.date(byAdding: .day, value: 1, to: Date())!

        let timeline = Timeline(entries: entries, policy: .after(tomorrow9am))
        completion(timeline)
    }

    private static let sampleDates: [UpcomingDate] = [
        UpcomingDate(id: "1", title: "WWDC 2026", date: "2026-06-09", confidence: "high", category: "tech"),
        UpcomingDate(id: "2", title: "iPhone 18 Launch", date: "2026-09-15", confidence: "medium", category: "tech"),
        UpcomingDate(id: "3", title: "Project Deadline", date: "2026-04-01", confidence: "high", category: "personal"),
        UpcomingDate(id: "4", title: "Conference Talk", date: "2026-05-20", confidence: "medium", category: "business"),
    ]
}

struct GoldfishWidgetEntryView: View {
    var entry: Provider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("UPCOMING")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)

            if entry.upcomingDates.isEmpty {
                Spacer()
                Text("No upcoming dates")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(entry.upcomingDates.prefix(4)) { item in
                    HStack {
                        Text(item.title)
                            .font(.callout)
                            .lineLimit(1)
                        Spacer()
                        Text(entry.showDate ? item.displayDate : item.daysRemainingText)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                if entry.upcomingDates.count < 4 {
                    Spacer()
                }
            }
        }
    }
}

struct GoldfishWidget: Widget {
    let kind: String = "GoldfishWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                GoldfishWidgetEntryView(entry: entry)
                    .environment(\.colorScheme, entry.isDarkMode ? .dark : .light)
                    .containerBackground(for: .widget) {
                        Color(entry.isDarkMode ? .systemBackground : .secondarySystemBackground)
                            .environment(\.colorScheme, entry.isDarkMode ? .dark : .light)
                    }
            } else {
                GoldfishWidgetEntryView(entry: entry)
                    .padding()
                    .background(Color(entry.isDarkMode ? .systemBackground : .secondarySystemBackground))
                    .environment(\.colorScheme, entry.isDarkMode ? .dark : .light)
            }
        }
        .configurationDisplayName("Upcoming Dates")
        .description("Shows your next upcoming confirmed dates.")
        .supportedFamilies([.systemMedium])
    }
}

#Preview(as: .systemMedium) {
    GoldfishWidget()
} timeline: {
    UpcomingEntry(date: .now, upcomingDates: [
        UpcomingDate(id: "1", title: "WWDC 2026", date: "2026-06-09", confidence: "high", category: "tech"),
        UpcomingDate(id: "2", title: "iPhone 18 Launch", date: "2026-09-15", confidence: "medium", category: "tech"),
        UpcomingDate(id: "3", title: "Project Deadline", date: "2026-04-01", confidence: "high", category: "personal"),
        UpcomingDate(id: "4", title: "Conference Talk", date: "2026-05-20", confidence: "medium", category: "business"),
    ], isDarkMode: false, showDate: false)
}
