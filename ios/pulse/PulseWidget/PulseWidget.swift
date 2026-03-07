import WidgetKit
import SwiftUI

struct UpcomingEntry: TimelineEntry {
    let date: Date
    let upcomingDates: [UpcomingDate]
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> UpcomingEntry {
        UpcomingEntry(date: Date(), upcomingDates: Self.sampleDates)
    }

    func getSnapshot(in context: Context, completion: @escaping (UpcomingEntry) -> Void) {
        let dates = context.isPreview ? Self.sampleDates : SharedDefaults.read()
        completion(UpcomingEntry(date: Date(), upcomingDates: dates))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UpcomingEntry>) -> Void) {
        let dates = SharedDefaults.read()
        var entries: [UpcomingEntry] = []

        entries.append(UpcomingEntry(date: Date(), upcomingDates: dates))

        if let midnight = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 0),
            matchingPolicy: .nextTime
        ) {
            entries.append(UpcomingEntry(date: midnight, upcomingDates: dates))
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
        UpcomingDate(id: "1", title: "WWDC 2026", date: "2026-06-09", confidence: "high"),
        UpcomingDate(id: "2", title: "iPhone 18 Launch", date: "2026-09-15", confidence: "medium"),
        UpcomingDate(id: "3", title: "Project Deadline", date: "2026-04-01", confidence: "high"),
        UpcomingDate(id: "4", title: "Conference Talk", date: "2026-05-20", confidence: "medium"),
    ]
}

struct PulseWidgetEntryView: View {
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
                        Text(item.daysRemainingText)
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

struct PulseWidget: Widget {
    let kind: String = "PulseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                PulseWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                PulseWidgetEntryView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Upcoming Dates")
        .description("Shows your next upcoming confirmed dates.")
        .supportedFamilies([.systemMedium])
    }
}

#Preview(as: .systemMedium) {
    PulseWidget()
} timeline: {
    UpcomingEntry(date: .now, upcomingDates: [
        UpcomingDate(id: "1", title: "WWDC 2026", date: "2026-06-09", confidence: "high"),
        UpcomingDate(id: "2", title: "iPhone 18 Launch", date: "2026-09-15", confidence: "medium"),
        UpcomingDate(id: "3", title: "Project Deadline", date: "2026-04-01", confidence: "high"),
        UpcomingDate(id: "4", title: "Conference Talk", date: "2026-05-20", confidence: "medium"),
    ])
}
