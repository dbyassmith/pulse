import Foundation

struct WatchlistItem: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var type: String
    var category: String?
    var status: String
    var notes: String?
    var added: String?

    var categoryIcon: String {
        UpcomingDate.iconForCategory(category)
    }

    var typeLabel: String {
        switch type {
        case "one-time": return "One-time"
        case "recurring-irregular": return "Recurring"
        case "recurring-predictable": return "Recurring"
        case "series": return "Series"
        case "category-watch": return "Watching"
        default: return type.capitalized
        }
    }

    private static let displayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d, yyyy"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    var addedDisplay: String? {
        guard let added = added else { return nil }
        // Try ISO 8601 first (from database)
        if let date = Self.isoFormatter.date(from: added) {
            return "Added " + Self.displayFormatter.string(from: date)
        }
        // Try plain date format
        let plain = DateFormatter()
        plain.dateFormat = "yyyy-MM-dd"
        plain.locale = Locale(identifier: "en_US_POSIX")
        if let date = plain.date(from: added) {
            return "Added " + Self.displayFormatter.string(from: date)
        }
        return nil
    }
}
