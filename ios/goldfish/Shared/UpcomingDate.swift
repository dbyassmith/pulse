import Foundation

struct UpcomingDate: Codable, Identifiable {
    let id: String
    let title: String
    let date: String
    let confidence: String
    let category: String?
    let source: String?
    let notes: String?
    let created_at: String?

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

    var categoryIcon: String {
        switch category?.lowercased() {
        case "tech": return "desktopcomputer"
        case "sports": return "sportscourt"
        case "entertainment": return "film"
        case "gaming": return "gamecontroller"
        case "birthday": return "birthday.cake"
        case "travel": return "airplane"
        case "personal": return "person"
        case "business": return "briefcase"
        case "holiday": return "star"
        default: return "tag"
        }
    }
}
