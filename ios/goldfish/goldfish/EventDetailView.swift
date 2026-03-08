import SwiftUI

struct EventDetailView: View {
    let date: UpcomingDate
    var onDelete: () -> Void
    var onUpdate: (UpcomingDate) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteAlert = false
    @State private var isEditing = false
    @State private var editingDate: UpcomingDate
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showErrorAlert = false

    private let bgColor = Color("AppBackground")

    private static let categories = [
        "tech", "sports", "entertainment", "gaming",
        "birthday", "travel", "personal", "business", "holiday"
    ]
    private static let confidenceLevels = ["high", "medium", "low"]

    init(date: UpcomingDate, onDelete: @escaping () -> Void, onUpdate: @escaping (UpcomingDate) -> Void) {
        self.date = date
        self.onDelete = onDelete
        self.onUpdate = onUpdate
        self._editingDate = State(initialValue: date)
    }

    private var selectedDate: Binding<Date> {
        Binding(
            get: {
                editingDate.parsedDate ?? Date()
            },
            set: { newDate in
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                formatter.locale = Locale(identifier: "en_US_POSIX")
                editingDate.date = formatter.string(from: newDate)
            }
        )
    }

    var body: some View {
        List {
            Section {
                if isEditing {
                    TextField("Title", text: $editingDate.title)
                        .font(.title2.bold())
                        .listRowSeparator(.hidden)
                } else {
                    Text(date.title)
                        .font(.title2.bold())
                        .listRowSeparator(.hidden)
                }
            }
            .listRowBackground(bgColor)

            Section {
                if isEditing {
                    DatePicker("Date", selection: selectedDate, displayedComponents: .date)
                    Picker("Confidence", selection: $editingDate.confidence) {
                        ForEach(Self.confidenceLevels, id: \.self) { level in
                            Text(level.capitalized).tag(level)
                        }
                    }
                    Picker("Category", selection: Binding(
                        get: { editingDate.category ?? "" },
                        set: { editingDate.category = $0.isEmpty ? nil : $0 }
                    )) {
                        Text("None").tag("")
                        ForEach(Self.categories, id: \.self) { cat in
                            Text(cat.capitalized).tag(cat)
                        }
                    }
                } else {
                    DetailRow(label: "Date", value: date.longDisplayDate)
                    DetailRow(label: "Countdown", value: date.daysRemainingText)
                    HStack(spacing: 6) {
                        Text("Category")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        if let category = date.category {
                            HStack(spacing: 3) {
                                Image(systemName: date.categoryIcon)
                                    .font(.caption2)
                                Text(category.capitalized)
                                    .font(.body)
                            }
                        } else {
                            Text("None")
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }
                    }
                    DetailRow(label: "Confidence", value: date.confidence.capitalized)
                }
            }
            .listRowBackground(bgColor)

            if isEditing || date.source != nil || date.notes != nil {
                Section {
                    if isEditing {
                        TextField("Source (optional)", text: Binding(
                            get: { editingDate.source ?? "" },
                            set: { editingDate.source = $0.isEmpty ? nil : $0 }
                        ))
                        TextField("Notes (optional)", text: Binding(
                            get: { editingDate.notes ?? "" },
                            set: { editingDate.notes = $0.isEmpty ? nil : $0 }
                        ), axis: .vertical)
                        .lineLimit(3...6)
                    } else {
                        if let source = date.source {
                            DetailRow(label: "Source", value: source)
                        }
                        if let notes = date.notes {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Notes")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(notes)
                                    .font(.body)
                            }
                        }
                    }
                }
                .listRowBackground(bgColor)
            }

            if !isEditing {
                Section {
                    Button(role: .destructive) {
                        showDeleteAlert = true
                    } label: {
                        Text("Delete Event")
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
                        editingDate = date
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
                        .disabled(editingDate.title.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            } else {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") {
                        editingDate = date
                        isEditing = true
                    }
                }
            }
        }
        .confirmationDialog(
            "Delete \"\(date.title)\"?",
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
            try await SupabaseService.shared.updateDate(editingDate)
            onUpdate(editingDate)
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
