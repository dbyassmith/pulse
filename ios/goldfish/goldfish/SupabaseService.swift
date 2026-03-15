import Foundation
import Supabase
import WidgetKit

@MainActor
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        let url = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String ?? ""
        let key = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String ?? ""

        client = SupabaseClient(
            supabaseURL: URL(string: url) ?? URL(string: "https://placeholder.supabase.co")!,
            supabaseKey: key
        )
    }

    var isAuthenticated: Bool {
        get async {
            let session = try? await client.auth.session
            return session != nil
        }
    }

    func signIn(email: String, password: String) async throws {
        try await client.auth.signIn(email: email, password: password)
    }

    func signOut() async throws {
        try await client.auth.signOut()
        SharedDefaults.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: "GoldfishWidget")
    }

    func fetchAllUpcoming() async throws -> [UpcomingDate] {
        let today = Self.todayString()
        let dates: [UpcomingDate] = try await client
            .from("confirmed_dates")
            .select("id, title, date, confidence, category, source, notes")
            .gte("date", value: today)
            .order("date", ascending: true)
            .execute()
            .value
        return dates
    }

    func fetchWidgetDates() async throws -> [UpcomingDate] {
        let today = Self.todayString()
        let dates: [UpcomingDate] = try await client
            .from("confirmed_dates")
            .select("id, title, date, confidence, category")
            .gte("date", value: today)
            .order("date", ascending: true)
            .limit(4)
            .execute()
            .value
        return dates
    }

    func updateDate(_ date: UpcomingDate) async throws {
        struct DateUpdate: Encodable {
            let title: String
            let date: String
            let confidence: String
            let category: String?
            let source: String?
            let notes: String?
        }
        let payload = DateUpdate(
            title: date.title,
            date: date.date,
            confidence: date.confidence,
            category: date.category,
            source: date.source,
            notes: date.notes
        )
        try await client
            .from("confirmed_dates")
            .update(payload)
            .eq("id", value: date.id)
            .execute()
    }

    func fetchWatchlistItems() async throws -> [WatchlistItem] {
        let items: [WatchlistItem] = try await client
            .from("watchlist_items")
            .select("id, title, type, category, status, notes, added")
            .eq("status", value: "active")
            .order("added", ascending: false)
            .execute()
            .value
        return items
    }

    func updateWatchlistItem(_ item: WatchlistItem) async throws {
        struct ItemUpdate: Encodable {
            let title: String
            let type: String
            let category: String?
            let notes: String?
        }
        let payload = ItemUpdate(
            title: item.title,
            type: item.type,
            category: item.category,
            notes: item.notes
        )
        try await client
            .from("watchlist_items")
            .update(payload)
            .eq("id", value: item.id)
            .execute()
    }

    func deleteWatchlistItem(id: String) async throws {
        try await client
            .from("watchlist_items")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    func deleteDate(id: String) async throws {
        try await client
            .from("confirmed_dates")
            .delete()
            .eq("id", value: id)
            .execute()
    }

    func refreshWidgetData() async throws {
        let dates = try await fetchWidgetDates()
        SharedDefaults.write(dates)
        WidgetCenter.shared.reloadTimelines(ofKind: "GoldfishWidget")
    }

    private static func todayString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.string(from: Date())
    }
}
