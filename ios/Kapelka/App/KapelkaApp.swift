import SwiftUI
import UserNotifications

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
        // Before the launch ends: a tap on a notification that launched the app comes to it (FT-253)
        UNUserNotificationCenter.current().delegate = NoticePresenter.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
                // Once, on the screen: a command or a background refresh has none and asks nothing
                .task { await SystemNotices.askOnce() }
        }
        // On screen a haptic answers, off it a notification (FT-251): the phase from the start, before any change
        .onChange(of: scenePhase, initial: true) { _, phase in
            services.feedback.screenChanged(isActive: phase == .active)
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
