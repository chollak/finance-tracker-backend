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
    /// The server's records for «Записи», with the queue's address and token (FT-219, FT-220).
    let records: RecordsFeed
    /// The one entry for what the phone answers (FT-251): each pass of the queue, from the screen and the commands
    /// alike, and the screen's own events — a haptic on screen, the notifications off it (FT-253).
    let feedback: FeedbackEntry

    /// One per process: the screen, the background refresh and the App Shortcuts share the queue, so two of them
    /// never send at once. «Записать оплату» runs here too, the app not opened.
    static let shared = live()

    private static func live() -> AppServices {
        let settings = SettingsStore()
        let cards = CardAccountStore()
        let transport = URLSessionTransport.shared
        let center = SystemNoticeCenter()
        let feedback = FeedbackEntry(notices: BackgroundNotices(center: center, memory: NoticeMemory()))
        let queue = CaptureQueue(
            store: .inApplicationSupport,
            sender: CaptureClient(
                configuration: { settings.configuration() },
                transport: transport,
                accountName: { cards.account(for: $0) }
            ),
            onPass: { await feedback.queuePassed($0) }
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
                isConfigured: { settings.configuration() != nil },
                notify: { await center.add($0) }
            ),
            records: RecordsFeed(
                client: RecordsClient(configuration: { settings.configuration() }, transport: transport),
                cache: .inApplicationSupport
            ),
            feedback: feedback
        )
    }
}
