import SwiftUI

struct AddEventView: View {
    var onSave: (UpcomingDate) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var date = Date()
    @State private var confidence = "high"
    @State private var category = ""
    @State private var source = ""
    @State private var notes = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showErrorAlert = false

    private let bgColor = Color("AppBackground")

    private static let categories = [
        "tech", "sports", "entertainment", "gaming",
        "birthday", "travel", "personal", "business", "holiday"
    ]
    private static let confidenceLevels = ["high", "medium", "low"]

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Event title", text: $title)
                        .font(.title2.bold())
                }
                .listRowBackground(bgColor)

                Section {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    Picker("Confidence", selection: $confidence) {
                        ForEach(Self.confidenceLevels, id: \.self) { level in
                            Text(level.capitalized).tag(level)
                        }
                    }
                    Picker("Category", selection: $category) {
                        Text("None").tag("")
                        ForEach(Self.categories, id: \.self) { cat in
                            Text(cat.capitalized).tag(cat)
                        }
                    }
                }
                .listRowBackground(bgColor)

                Section {
                    TextField("Source (optional)", text: $source)
                    TextField("Notes (optional)", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }
                .listRowBackground(bgColor)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(bgColor)
            .navigationTitle("Add Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task { await save() }
                        }
                        .bold()
                        .disabled(!canSave)
                    }
                }
            }
            .alert("Error", isPresented: $showErrorAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "An unknown error occurred.")
            }
        }
    }

    private func save() async {
        isSaving = true
        let newDate = UpcomingDate(
            id: UUID().uuidString,
            title: title.trimmingCharacters(in: .whitespaces),
            date: Self.dateFormatter.string(from: date),
            confidence: confidence,
            category: category.isEmpty ? nil : category,
            source: source.isEmpty ? nil : source,
            notes: notes.isEmpty ? nil : notes
        )
        do {
            try await SupabaseService.shared.createDate(newDate)
            onSave(newDate)
            dismiss()
        } catch {
            errorMessage = "Failed to save event. Please try again."
            showErrorAlert = true
        }
        isSaving = false
    }
}
