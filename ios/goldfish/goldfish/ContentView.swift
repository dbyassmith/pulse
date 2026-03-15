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
    @State private var selectedWatchlistCategory: String?
    @State private var availableWatchlistCategories: [String] = []
    @State private var selectedDate: UpcomingDate?
    @State private var showChat = false
    @State private var chatID = UUID()
    var onSignOut: () -> Void

    private var availableCategories: [String] {
        Array(Set(dates.compactMap { $0.category })).sorted()
    }

    private var filteredDates: [UpcomingDate] {
        guard let selected = selectedCategory else { return dates }
        return dates.filter { $0.category?.lowercased() == selected.lowercased() }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                tabPicker
                tabContent
            }
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
                ToolbarItem(placement: .topBarLeading) {
                    if selectedTab == 0 {
                        filterMenu
                    } else if selectedTab == 1 {
                        watchlistFilterMenu
                    }
                }
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
            .onAppear {
                Task { await loadDates() }
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
            .overlay(alignment: .bottomTrailing) {
                chatFAB
            }
            .sheet(isPresented: $showChat) {
                chatSheet
            }
        }
    }

    private var tabPicker: some View {
        Picker("Tab", selection: $selectedTab) {
            Text("Upcoming").tag(0)
            Text("Watchlist").tag(1)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private var tabContent: some View {
        ZStack {
            upcomingContent
                .opacity(selectedTab == 0 ? 1 : 0)
            WatchlistView(
                selectedCategory: selectedWatchlistCategory,
                onCategoriesChanged: { availableWatchlistCategories = $0 }
            )
                .opacity(selectedTab == 1 ? 1 : 0)
        }
    }

    private var chatFAB: some View {
        Button {
            showChat = true
        } label: {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.title2)
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Color.orange)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.2), radius: 6, x: 0, y: 3)
        }
        .padding(.trailing, 20)
        .padding(.bottom, 20)
    }

    private var chatSheet: some View {
        NavigationStack {
            ChatView()
                .id(chatID)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Done") {
                            showChat = false
                        }
                    }
                    ToolbarItem(placement: .principal) {
                        HStack(spacing: 5) {
                            OrangeDot()
                            Text("Chat")
                                .fontWeight(.semibold)
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            chatID = UUID()
                        } label: {
                            Image(systemName: "square.and.pencil")
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

    private var groupedDates: [(key: String, dates: [UpcomingDate])] {
        let cal = Calendar.current
        let now = Date()
        let cutoff = cal.date(byAdding: .month, value: 12, to: cal.startOfDay(for: now))!

        let monthFormatter = DateFormatter()
        monthFormatter.dateFormat = "MMMM yyyy"
        monthFormatter.locale = Locale(identifier: "en_US_POSIX")

        var sections: [(key: String, dates: [UpcomingDate])] = []
        var sectionMap: [String: Int] = [:]
        let futureKey = "Future"

        for date in filteredDates {
            let sectionKey: String
            if let parsed = date.parsedDate, parsed < cutoff {
                sectionKey = monthFormatter.string(from: parsed)
            } else {
                sectionKey = futureKey
            }

            if let idx = sectionMap[sectionKey] {
                sections[idx].dates.append(date)
            } else {
                sectionMap[sectionKey] = sections.count
                sections.append((key: sectionKey, dates: [date]))
            }
        }

        return sections
    }

    @ViewBuilder
    private var upcomingContent: some View {
        if isLoading {
            ProgressView()
                .frame(maxHeight: .infinity)
        } else if filteredDates.isEmpty {
            ContentUnavailableView(
                selectedCategory != nil ? "No \(selectedCategory!.capitalized) Events" : "No Upcoming Dates",
                systemImage: selectedCategory != nil ? "line.3.horizontal.decrease.circle" : "calendar",
                description: Text(selectedCategory != nil ? "No events match this filter." : "Confirmed dates will appear here.")
            )
        } else {
            List {
                ForEach(groupedDates, id: \.key) { section in
                    Section {
                        ForEach(section.dates) { date in
                            dateRow(date)
                            .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
                            .listRowBackground(Color("AppBackground"))
                            .listRowSeparatorTint(Color(UIColor.separator))
                            .alignmentGuide(.listRowSeparatorLeading) { _ in -20 }
                            .alignmentGuide(.listRowSeparatorTrailing) { d in d.width + 20 }
                            .listRowSeparator(.hidden, edges: date.id == section.dates.last?.id ? .bottom : [])
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
                    } header: {
                        Text(section.key.uppercased())
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(.secondary)
                            .listRowInsets(EdgeInsets(top: 16, leading: 20, bottom: 4, trailing: 20))
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable {
                await loadDates()
            }
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

    private var watchlistFilterMenu: some View {
        Menu {
            Button {
                selectedWatchlistCategory = nil
            } label: {
                HStack {
                    Text("All")
                    if selectedWatchlistCategory == nil {
                        Image(systemName: "checkmark")
                    }
                }
            }
            ForEach(availableWatchlistCategories, id: \.self) { cat in
                Button {
                    selectedWatchlistCategory = cat
                } label: {
                    HStack {
                        Image(systemName: UpcomingDate.iconForCategory(cat))
                        Text(cat.capitalized)
                        if selectedWatchlistCategory?.lowercased() == cat.lowercased() {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Image(systemName: selectedWatchlistCategory != nil ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
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
