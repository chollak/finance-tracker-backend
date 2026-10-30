import SwiftUI

/// The app itself; `KapelkaMain` starts it unless the tests run.
struct KapelkaApp: App {
    private let services: AppServices
    @State private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let services = AppServices.shared
        self.services = services
        _model = State(initialValue: AppModel(services: services))
        services.autoSender.start()
    }

    var body: some Scene {
        WindowGroup {
            MainView(model: model)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: Task { await model.appBecameActive() }
            case .background: Task { await model.appMovedToBackground() }
            default: break
            }
        }
        .backgroundTask(.appRefresh(BackgroundSend.taskIdentifier)) { [background = services.background] in
            await background.run()
        }
    }
}
