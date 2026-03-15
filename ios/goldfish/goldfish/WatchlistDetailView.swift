import SwiftUI

struct WatchlistDetailView: View {
    let item: WatchlistItem
    var onDelete: () -> Void
    var onUpdate: (WatchlistItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteAlert = false
    @State private var isEditing = false
    @State private var editingItem: WatchlistItem
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showErrorAlert = false

    private let bgColor = Color("AppBackground")

    private static let categories = [
        "tech", "sports", "entertainment", "gaming",
        "birthday", "travel", "personal", "business", "holiday",
        "politics", "local"
    ]
    private static let types = [
        "one-time", "recurring-irregular", "recurring-predictable", "series", "category-watch"
    ]

    init(item: WatchlistItem, onDelete: @escaping () -> Void, onUpdate: @escaping (WatchlistItem) -> Void) {
        self.item = item
        self.onDelete = onDelete
        self.onUpdate = onUpdate
        self._editingItem = State(initialValue: item)
    }

    private func typeDisplayName(_ type: String) -> String {
        switch type {
        case "one-time": return "One-time"
        case "recurring-irregular": return "Recurring (Irregular)"
        case "recurring-predictable": return "Recurring (Predictable)"
        case "series": return "Series"
        case "category-watch": return "Category Watch"
        default: return type.capitalized
        }
    }

    var body: some View {
        List {
            Section {
                if isEditing {
                    Picker("Category", selection: Binding(
                        get: { editingItem.category ?? "" },
                        set: { editingItem.category = $0.isEmpty ? nil : $0 }
                    )) {
                        Text("None").tag("")
                        ForEach(Self.categories, id: \.self) { cat in
                            Text(cat.capitalized).tag(cat)
                        }
                    }
                    .listRowSeparator(.hidden)
                    TextField("Subcategory (optional)", text: Binding(
                        get: { editingItem.subcategory ?? "" },
                        set: { editingItem.subcategory = $0.isEmpty ? nil : $0.lowercased().trimmingCharacters(in: .whitespaces) }
                    ))
                    .listRowSeparator(.hidden)
                    TextField("Title", text: $editingItem.title)
                        .font(.title2.bold())
                        .listRowSeparator(.hidden)
                    TextField("Notes (optional)", text: Binding(
                        get: { editingItem.notes ?? "" },
                        set: { editingItem.notes = $0.isEmpty ? nil : $0 }
                    ), axis: .vertical)
                    .lineLimit(3...6)
                    .listRowSeparator(.hidden)
                } else {
                    if let category = item.category {
                        HStack(spacing: 3) {
                            Image(systemName: item.categoryIcon)
                                .font(.caption2)
                            Text(item.subcategory != nil ? "\(category.capitalized) — \(item.subcategory!.capitalized)" : category.capitalized)
                                .font(.caption)
                        }
                        .foregroundStyle(.secondary)
                        .listRowSeparator(.hidden)
                    }
                    Text(item.title)
                        .font(.title2.bold())
                        .listRowSeparator(.hidden)
                    if let notes = item.notes {
                        Text(notes)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .listRowSeparator(.hidden)
                    }
                }
            }
            .listRowBackground(bgColor)

            Section {
                if isEditing {
                    Picker("Type", selection: $editingItem.type) {
                        ForEach(Self.types, id: \.self) { t in
                            Text(typeDisplayName(t)).tag(t)
                        }
                    }
                } else {
                    DetailRow(label: "Type", value: item.typeLabel)
                    if let addedDisplay = item.addedDisplay {
                        DetailRow(label: "Added", value: addedDisplay.replacingOccurrences(of: "Added ", with: ""))
                    }
                }
            }
            .listRowBackground(bgColor)

            if !isEditing {
                Section {
                    Button(role: .destructive) {
                        showDeleteAlert = true
                    } label: {
                        Text("Delete Item")
                            .frame(maxWidth: .infinity)
                    }
                }
                .listRowBackground(bgColor)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(bgColor)
        .navigationTitle(isEditing ? "Edit" : "Details")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(isEditing)
        .toolbar {
            if isEditing {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        editingItem = item
                        isEditing = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task { await save() }
                        }
                        .bold()
                        .disabled(editingItem.title.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            } else {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") {
                        editingItem = item
                        isEditing = true
                    }
                }
            }
        }
        .confirmationDialog(
            "Delete \"\(item.title)\"?",
            isPresented: $showDeleteAlert,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                onDelete()
                dismiss()
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

    private func save() async {
        isSaving = true
        do {
            try await SupabaseService.shared.updateWatchlistItem(editingItem)
            onUpdate(editingItem)
            isEditing = false
        } catch {
            errorMessage = "Failed to save changes. Please try again."
            showErrorAlert = true
        }
        isSaving = false
    }
}

private struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.body)
        }
    }
}
