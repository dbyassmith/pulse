import Foundation
import WidgetKit

enum SharedDefaults {
    private static let suiteName = "group.com.dbyassmith.pulse"
    private static let key = "upcomingDates"

    static func read() -> [UpcomingDate] {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: key) else {
            return []
        }
        return (try? JSONDecoder().decode([UpcomingDate].self, from: data)) ?? []
    }

    static func write(_ dates: [UpcomingDate]) {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = try? JSONEncoder().encode(dates) else {
            return
        }
        defaults.set(data, forKey: key)
        defaults.synchronize()
    }

    static func clear() {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return }
        defaults.removeObject(forKey: key)
        defaults.synchronize()
    }
}
