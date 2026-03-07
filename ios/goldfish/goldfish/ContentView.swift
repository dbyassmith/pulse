import SwiftUI
import WidgetKit

struct ContentView: View {
    @State private var dates: [UpcomingDate] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var dateToDelete: UpcomingDate?
    @State private var showDeleteAlert = false
    @State private var showErrorAlert = false
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
                                HStack(spacing: 6) {
                                    Text(date.displayDate)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if let category = date.category {
                                        Text(category.uppercased())
                                            .font(.caption2)
                                            .fontWeight(.medium)
                                            .foregroundStyle(.secondary)
                                            .padding(.horizontal, 5)
                                            .padding(.vertical, 1)
                                            .background(.quaternary)
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                            Spacer()
                            Text(date.daysRemainingText)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                        .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
                        .listRowBackground(Color(red: 0xF8/255, green: 0xED/255, blue: 0xD9/255))
                        .listRowSeparator(.hidden, edges: date.id == dates.first?.id ? .top : [])
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button {
                                dateToDelete = date
                                showDeleteAlert = true
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            .tint(.red)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Color(red: 0xF8/255, green: 0xED/255, blue: 0xD9/255))
            .navigationTitle("Goldfish")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsView(onSignOut: onSignOut)
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .task {
                await loadDates()
            }
            .refreshable {
                await loadDates()
            }
            .confirmationDialog(
                "Delete \"\(dateToDelete?.title ?? "")\"?",
                isPresented: $showDeleteAlert,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    if let date = dateToDelete {
                        Task { await deleteDate(date) }
                    }
                }
            } message: {
                Text("This will be permanently removed.")
            }
            .alert("Error", isPresented: $showErrorAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "An unknown error occurred.")
            }
        }
    }

    private func deleteDate(_ date: UpcomingDate) async {
        do {
            try await SupabaseService.shared.deleteDate(id: date.id)
            withAnimation {
                dates.removeAll { $0.id == date.id }
            }
            SharedDefaults.write(Array(dates.prefix(4)))
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            errorMessage = "Failed to delete \"\(date.title)\". Please try again."
            showErrorAlert = true
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
