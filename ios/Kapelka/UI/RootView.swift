import SwiftUI

/// The two tabs «Записать» and «Записи» with the settings sheet over them (FT-220). «Записать трату» from the Action
/// Button opens «Записать» and listens, whichever tab was open.
struct RootView: View {
    let model: AppModel

    @State private var navigation = AppNavigation()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var navigation = navigation
        TabView(selection: $navigation.tab) {
            CaptureView(model: model, openSettings: openSettings)
                .tabItem { Label("Записать", systemImage: "mic") }
                .tag(AppNavigation.Tab.capture)
            RecordsView(list: model.records, openSettings: openSettings)
                .tabItem { Label("Записи", systemImage: "list.bullet") }
                .tag(AppNavigation.Tab.records)
        }
        .tint(.primary)
        .playsHaptics(of: model.services.feedback)
        .sheet(isPresented: $navigation.showsSettings) {
            SettingsView(model: model)
        }
        .onAppear {
            navigation.appeared(isConfigured: model.isConfigured)
            screenChanged()
        }
        .onChange(of: navigation.listenPending) { screenChanged() }
        .onChange(of: navigation.openPending) { screenChanged() }
        .onChange(of: scenePhase) { screenChanged() }
        // A press while the settings were open listens once they close; new settings refresh the list
        .onChange(of: navigation.showsSettings) { screenChanged() }
        .onChange(of: navigation.tab) { screenChanged() }
    }

    private func openSettings() {
        navigation.showsSettings = true
    }

    /// A tap on a notification opens its place first; the first press listens, a press while listening ends the
    /// phrase.
    private func screenChanged() {
        navigation.takeOpenRequest()
        if navigation.takeListenRequest(sceneActive: scenePhase == .active) {
            model.voice.commandPressed()
        }
        if model.records.setOnScreen(navigation.recordsOnScreen(scenePhase: scenePhase)) {
            Task { await model.records.refresh() }
        }
    }
}

/// The gear of both tabs.
struct SettingsButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Настройки", systemImage: "gearshape")
        }
    }
}
