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
        // Application Support is always there; Documents only if iOS refused to create the folder
        let store = (try? CaptureFileStore.inApplicationSupport())
            ?? CaptureFileStore(fileURL: URL.documentsDirectory.appending(path: "captures.json"))
        let queue = CaptureQueue(
            store: store,
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
