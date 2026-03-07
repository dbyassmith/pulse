import SwiftUI
import WidgetKit

struct SettingsView: View {
    var onSignOut: () -> Void

    @State private var widgetDarkMode = SharedDefaults.widgetDarkMode
    @State private var widgetShowDate = SharedDefaults.widgetShowDate

    private let bgColor = Color(red: 0xF8/255, green: 0xED/255, blue: 0xD9/255)

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
        .background(Color(red: 0xF8/255, green: 0xED/255, blue: 0xD9/255))
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}
