import Foundation

struct UpcomingDate: Codable, Identifiable {
    let id: String
    let title: String
    let date: String
    let confidence: String
    let category: String?

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    var parsedDate: Date? {
        Self.formatter.date(from: date)
    }

    var daysRemaining: Int? {
        guard let parsed = parsedDate else { return nil }
        return Calendar.current.dateComponents(
            [.day],
            from: Calendar.current.startOfDay(for: Date()),
            to: Calendar.current.startOfDay(for: parsed)
        ).day
    }

    var daysRemainingText: String {
        guard let days = daysRemaining else { return date }
        switch days {
        case 0: return "Today"
        case 1: return "1 day"
        default: return "\(days) days"
        }
    }

    private static let displayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    var displayDate: String {
        guard let parsed = parsedDate else { return date }
        return Self.displayFormatter.string(from: parsed)
    }
}
