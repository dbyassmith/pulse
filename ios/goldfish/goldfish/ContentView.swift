import SwiftUI
import WidgetKit

struct ContentView: View {
    @State private var selectedTab = 0
    @State private var dates: [UpcomingDate] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var dateToDelete: UpcomingDate?
    @State private var showDeleteAlert = false
    @State private var showErrorAlert = false
    @State private var selectedCategory: String?
    @State private var selectedDate: UpcomingDate?
    var onSignOut: () -> Void

    private var availableCategories: [String] {
        Array(Set(dates.compactMap { $0.category })).sorted()
    }

    private var filteredDates: [UpcomingDate] {
        guard let selected = selectedCategory else { return dates }
        return dates.filter { $0.category?.lowercased() == selected.lowercased() }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            upcomingTab
                .tabItem {
                    Label("Upcoming", systemImage: "calendar")
                }
                .tag(0)

            watchlistTab
                .tabItem {
                    Label("Watchlist", systemImage: "eye")
                }
                .tag(1)
        }
        .tint(.orange)
    }

    private var upcomingTab: some View {
        NavigationStack {
            mainContent
            .background(Color("AppBackground"))
            .navigationDestination(item: $selectedDate) { date in
                EventDetailView(date: date, onDelete: {
                    Task { await deleteDate(date) }
                }, onUpdate: { updated in
                    if let idx = dates.firstIndex(where: { $0.id == updated.id }) {
                        dates[idx] = updated
                    }
                    SharedDefaults.write(Array(dates.prefix(4)))
                    WidgetCenter.shared.reloadAllTimelines()
                })
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { filterMenu }
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 5) {
                        OrangeDot()
                        Text("Goldfish")
                            .fontWeight(.semibold)
                    }
                }
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

    private var watchlistTab: some View {
        NavigationStack {
            WatchlistView()
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        HStack(spacing: 5) {
                            OrangeDot()
                            Text("Watchlist")
                                .fontWeight(.semibold)
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            SettingsView(onSignOut: onSignOut)
                        } label: {
                            Image(systemName: "gearshape")
                        }
                    }
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

    @ViewBuilder
    private var mainContent: some View {
        if isLoading {
            ProgressView()
        } else if filteredDates.isEmpty {
            ContentUnavailableView(
                selectedCategory != nil ? "No \(selectedCategory!.capitalized) Events" : "No Upcoming Dates",
                systemImage: selectedCategory != nil ? "line.3.horizontal.decrease.circle" : "calendar",
                description: Text(selectedCategory != nil ? "No events match this filter." : "Confirmed dates will appear here.")
            )
        } else {
            List(filteredDates) { date in
                dateRow(date)
                .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
                .listRowBackground(Color("AppBackground"))
                .listRowSeparatorTint(Color(UIColor.separator))
                .alignmentGuide(.listRowSeparatorLeading) { _ in -20 }
                .alignmentGuide(.listRowSeparatorTrailing) { d in d.width + 20 }
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

    private var filterMenu: some View {
        Menu {
            Button {
                selectedCategory = nil
            } label: {
                HStack {
                    Text("All")
                    if selectedCategory == nil {
                        Image(systemName: "checkmark")
                    }
                }
            }
            ForEach(availableCategories, id: \.self) { cat in
                Button {
                    selectedCategory = cat
                } label: {
                    HStack {
                        Image(systemName: UpcomingDate.iconForCategory(cat))
                        Text(cat.capitalized)
                        if selectedCategory?.lowercased() == cat.lowercased() {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Image(systemName: selectedCategory != nil ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
    }

    @ViewBuilder
    private func dateRow(_ date: UpcomingDate) -> some View {
        Button {
            selectedDate = date
        } label: {
            HStack(spacing: 14) {
                Image(systemName: date.categoryIcon)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(width: 28, alignment: .center)
                VStack(alignment: .leading) {
                    Text(date.title)
                        .font(.body)
                    Text(date.displayDate)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(date.daysRemainingText)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
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
            errorMessage = "Unable to load dates: \(error.localizedDescription)"
            showErrorAlert = true
        }
        isLoading = false
    }
}
