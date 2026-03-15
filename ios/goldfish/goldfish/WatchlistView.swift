import SwiftUI

struct WatchlistView: View {
    @State private var selectedItem: WatchlistItem?
    var selectedCategory: String?
    var onCategoriesChanged: (([String]) -> Void)?
    @State private var items: [WatchlistItem] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showErrorAlert = false
    @State private var itemToDelete: WatchlistItem?
    @State private var showDeleteAlert = false

    private var filteredItems: [WatchlistItem] {
        guard let selected = selectedCategory else { return items }
        return items.filter { $0.category?.lowercased() == selected.lowercased() }
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if filteredItems.isEmpty {
                ContentUnavailableView(
                    selectedCategory != nil ? "No \(selectedCategory!.capitalized) Items" : "No Watchlist Items",
                    systemImage: selectedCategory != nil ? "line.3.horizontal.decrease.circle" : "eye",
                    description: Text(selectedCategory != nil ? "No items match this filter." : "Items being monitored will appear here.")
                )
            } else {
                List(filteredItems) { item in
                    Button {
                        selectedItem = item
                    } label: {
                        watchlistRow(item)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
                    .listRowBackground(Color("AppBackground"))
                    .listRowSeparatorTint(Color(UIColor.separator))
                    .alignmentGuide(.listRowSeparatorLeading) { _ in -20 }
                    .alignmentGuide(.listRowSeparatorTrailing) { d in d.width + 20 }
                    .listRowSeparator(.hidden, edges: item.id == items.first?.id ? .top : [])
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button {
                            itemToDelete = item
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
        .confirmationDialog(
            "Delete \"\(itemToDelete?.title ?? "")\"?",
            isPresented: $showDeleteAlert,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let item = itemToDelete {
                    Task { await deleteItem(item) }
                }
            }
        } message: {
            Text("This will be permanently removed.")
        }
        .navigationDestination(item: $selectedItem) { item in
            WatchlistDetailView(item: item, onDelete: {
                Task { await deleteItem(item) }
            }, onUpdate: { updated in
                if let idx = items.firstIndex(where: { $0.id == updated.id }) {
                    items[idx] = updated
                }
            })
        }
    }

    private func deleteItem(_ item: WatchlistItem) async {
        do {
            try await SupabaseService.shared.deleteWatchlistItem(id: item.id)
            withAnimation {
                items.removeAll { $0.id == item.id }
            }
            reportCategories()
        } catch {
            errorMessage = "Failed to delete \"\(item.title)\". Please try again."
            showErrorAlert = true
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
            reportCategories()
        } catch {
            errorMessage = "Unable to load watchlist: \(error.localizedDescription)"
            showErrorAlert = true
        }
        isLoading = false
    }

    private func reportCategories() {
        let categories = Array(Set(items.compactMap { $0.category })).sorted()
        onCategoriesChanged?(categories)
    }
}
