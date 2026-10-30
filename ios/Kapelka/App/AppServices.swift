import Foundation

/// Everything the app runs on, built once at launch and shared by the screen and the background refresh.
struct AppServices: Sendable {
    let settings: SettingsStore
    let cards: CardAccountStore
    let queue: CaptureQueue
    let autoSender: AutoSender
    let background: BackgroundSend
    let health: HealthCheck
    let payments: PaymentRecorder

    /// One per process: the screen, the background refresh and the App Shortcuts share the queue, so two of them
    /// never send at once. «Записать оплату» runs here too, the app not opened.
    static let shared = live()

    private static func live() -> AppServices {
        let settings = SettingsStore()
        let cards = CardAccountStore()
        let transport = URLSessionTransport.shared
        let queue = CaptureQueue(
            store: .inApplicationSupport,
            sender: CaptureClient(
                configuration: { settings.configuration() },
                transport: transport,
                accountName: { cards.account(for: $0) }
            )
        )
        let background = BackgroundSend(queue: queue, scheduler: SystemRefreshScheduler())
        return AppServices(
            settings: settings,
            cards: cards,
            queue: queue,
            autoSender: AutoSender(watcher: NetworkPathWatcher(), queue: queue),
            background: background,
            health: HealthCheck(transport: transport),
            payments: PaymentRecorder(
                queue: queue,
                cards: cards,
                send: { await background.run() },
                isConfigured: { settings.configuration() != nil }
            )
        )
    }
}
