import SwiftUI
import WidgetKit

struct SettingsView: View {
    var onSignOut: () -> Void

    @State private var widgetDarkMode = SharedDefaults.widgetDarkMode
    @State private var widgetShowDate = SharedDefaults.widgetShowDate

    private let bgColor = Color("AppBackground")

    var body: some View {
        List {
            Section("Widget") {
                Toggle("Dark Mode", isOn: $widgetDarkMode)
                    .listSectionSeparator(.hidden, edges: .top)
                    .onChange(of: widgetDarkMode) { _, newValue in
                        SharedDefaults.widgetDarkMode = newValue
                        WidgetCenter.shared.reloadAllTimelines()
                    }
                Toggle("Show Full Date", isOn: $widgetShowDate)
                    .onChange(of: widgetShowDate) { _, newValue in
                        SharedDefaults.widgetShowDate = newValue
                        WidgetCenter.shared.reloadAllTimelines()
                    }
            }
            .listRowBackground(bgColor)

            Section {
                Button(role: .destructive) {
                    Task {
                        try? await SupabaseService.shared.signOut()
                        onSignOut()
                    }
                } label: {
                    Text("Sign Out")
                        .frame(maxWidth: .infinity)
                }
            }
            .listRowBackground(bgColor)
        }
        .scrollContentBackground(.hidden)
        .background(Color("AppBackground"))
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}
