import Foundation

struct ChatMessage: Identifiable {
    let id = UUID()
    var role: Role
    var content: String

    enum Role {
        case user
        case assistant
    }

    enum ToolStatus {
        case searching
        case savingDate
        case addingToWatchlist

        var label: String {
            switch self {
            case .searching: return "Searching..."
            case .savingDate: return "Saving date..."
            case .addingToWatchlist: return "Adding to watchlist..."
            }
        }
    }

    static func toolStatus(for toolName: String) -> ToolStatus? {
        switch toolName {
        case "search_for_date": return .searching
        case "add_confirmed_date": return .savingDate
        case "create_watchlist_item": return .addingToWatchlist
        default: return nil
        }
    }
}
