import Foundation

struct UpcomingDate: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var date: String
    var confidence: String
    var category: String?
    var subcategory: String?
    var source: String? = nil
    var notes: String? = nil
    var created_at: String? = nil

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
        f.dateFormat = "EEE MMM d"
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
        Self.iconForCategory(category)
    }

    static func iconForCategory(_ category: String?) -> String {
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
        case "politics": return "building.columns"
        case "local": return "mappin.and.ellipse"
        default: return "tag"
        }
    }
}
