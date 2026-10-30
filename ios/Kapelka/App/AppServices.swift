import Foundation

/// Everything the app runs on, built once at launch and shared by the screen and the background refresh.
struct AppServices: Sendable {
    let settings: SettingsStore
    let queue: CaptureQueue
    let autoSender: AutoSender
    let background: BackgroundSend
    let health: HealthCheck

    static func live() -> AppServices {
        let settings = SettingsStore()
        let transport = URLSessionTransport.shared
        let queue = CaptureQueue(
            store: .inApplicationSupport,
            sender: CaptureClient(configuration: { settings.configuration() }, transport: transport)
        )
        return AppServices(
            settings: settings,
            queue: queue,
            autoSender: AutoSender(watcher: NetworkPathWatcher(), queue: queue),
            background: BackgroundSend(queue: queue, scheduler: SystemRefreshScheduler()),
            health: HealthCheck(transport: transport)
        )
    }
}
