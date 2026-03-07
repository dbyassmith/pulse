import SwiftUI

struct ContentView: View {
    @State private var dates: [UpcomingDate] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    var onSignOut: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView()
                } else if dates.isEmpty {
                    ContentUnavailableView(
                        "No Upcoming Dates",
                        systemImage: "calendar",
                        description: Text("Confirmed dates will appear here.")
                    )
                } else {
                    List(dates) { date in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(date.title)
                                    .font(.body)
                                Text(date.date)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(date.daysRemainingText)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Pulse")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign Out") {
                        Task {
                            try? await SupabaseService.shared.signOut()
                            onSignOut()
                        }
                    }
                    .font(.callout)
                }
            }
            .task {
                await loadDates()
            }
            .refreshable {
                await loadDates()
            }
        }
    }

    private func loadDates() async {
        do {
            dates = try await SupabaseService.shared.fetchAllUpcoming()
            try await SupabaseService.shared.refreshWidgetData()
            errorMessage = nil
        } catch {
            if dates.isEmpty {
                let cached = SharedDefaults.read()
                if !cached.isEmpty {
                    dates = cached
                }
            }
            errorMessage = "Unable to load dates."
        }
        isLoading = false
    }
}
