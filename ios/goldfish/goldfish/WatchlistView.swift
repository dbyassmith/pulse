import SwiftUI

struct WatchlistView: View {
    @State private var items: [WatchlistItem] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showErrorAlert = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if items.isEmpty {
                ContentUnavailableView(
                    "No Watchlist Items",
                    systemImage: "eye",
                    description: Text("Items being monitored will appear here.")
                )
            } else {
                List(items) { item in
                    watchlistRow(item)
                        .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
                        .listRowBackground(Color("AppBackground"))
                        .listRowSeparatorTint(Color(UIColor.separator))
                        .alignmentGuide(.listRowSeparatorLeading) { _ in -20 }
                        .alignmentGuide(.listRowSeparatorTrailing) { d in d.width + 20 }
                        .listRowSeparator(.hidden, edges: item.id == items.first?.id ? .top : [])
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Color("AppBackground"))
        .onAppear {
            Task { await loadItems() }
        }
        .refreshable {
            await loadItems()
        }
        .alert("Error", isPresented: $showErrorAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "An unknown error occurred.")
        }
    }

    @ViewBuilder
    private func watchlistRow(_ item: WatchlistItem) -> some View {
        HStack(spacing: 14) {
            Image(systemName: item.categoryIcon)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 28, alignment: .center)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.body)
                HStack(spacing: 6) {
                    Text(item.typeLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let category = item.category {
                        Text("·")
                            .font(.caption)
                            .foregroundStyle(.quaternary)
                        Text(category.capitalized)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
        }
    }

    private func loadItems() async {
        do {
            items = try await SupabaseService.shared.fetchWatchlistItems()
            errorMessage = nil
        } catch {
            errorMessage = "Unable to load watchlist: \(error.localizedDescription)"
            showErrorAlert = true
        }
        isLoading = false
    }
}
