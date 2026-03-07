import SwiftUI
import BackgroundTasks

@main
struct goldfishApp: App {
    @State private var isAuthenticated = false
    @State private var isCheckingAuth = true

    init() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.dbyassmith.goldfish.refresh",
            using: nil
        ) { task in
            Self.handleAppRefresh(task: task as! BGAppRefreshTask)
        }
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if isCheckingAuth {
                    ProgressView()
                } else if isAuthenticated {
                    ContentView(onSignOut: {
                        isAuthenticated = false
                    })
                } else {
                    LoginView(onLogin: {
                        isAuthenticated = true
                    })
                }
            }
            .task {
                isAuthenticated = await SupabaseService.shared.isAuthenticated
                isCheckingAuth = false
                if isAuthenticated {
                    scheduleAppRefresh()
                }
            }
        }
    }

    nonisolated private func scheduleAppRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: "com.dbyassmith.goldfish.refresh")
        request.earliestBeginDate = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 9),
            matchingPolicy: .nextTime
        )
        try? BGTaskScheduler.shared.submit(request)
    }

    nonisolated private static func handleAppRefresh(task: BGAppRefreshTask) {
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        Task { @MainActor in
            do {
                try await SupabaseService.shared.refreshWidgetData()
                task.setTaskCompleted(success: true)
            } catch {
                task.setTaskCompleted(success: false)
            }

            let request = BGAppRefreshTaskRequest(identifier: "com.dbyassmith.goldfish.refresh")
            request.earliestBeginDate = Calendar.current.nextDate(
                after: Date(),
                matching: DateComponents(hour: 9),
                matchingPolicy: .nextTime
            )
            try? BGTaskScheduler.shared.submit(request)
        }
    }
}
