import Foundation
import Observation
import UIKit

/// What the screens show and do; the work itself is in `AppServices`.
@MainActor
@Observable
final class AppModel {
    let services: AppServices
    let voice: VoiceCapture
    private(set) var queueState: QueueState
    private(set) var isConfigured: Bool

    init(services: AppServices, speech: AppleSpeech = AppleSpeech()) {
        self.services = services
        voice = VoiceCapture(system: speech, listener: speech) { [queue = services.queue] phrase in
            try await Self.write(phrase, to: queue)
        }
        queueState = QueueState()
        isConfigured = services.settings.configuration() != nil
        Task { [weak self, updates = services.queue.updates] in
            for await state in updates {
                self?.queueState = state
            }
        }
    }

    var pendingCount: Int {
        QueueStatus.pendingCount(queueState)
    }

    /// The list on the main screen, newest first.
    var rows: [CaptureRow] {
        CaptureRow.rows(queueState.captures, sendingId: queueState.sendingId, now: Date(), calendar: .current)
    }

    var hasToken: Bool {
        services.settings.hasToken
    }

    /// The answer to the last phrase: the server's summary or «в очереди N».
    var statusLine: String {
        QueueStatus.line(for: queueState, configured: isConfigured)
    }

    /// The phrase is on disk when this returns; sending goes on by itself.
    func add(_ text: String) async throws {
        try await Self.write(text, to: services.queue)
    }

    /// A waiting record goes, never sent; `nil` or what went wrong.
    func remove(_ id: UUID) async -> String? {
        do {
            let removed = try await services.queue.remove(id)
            // Its request went out between the swipe and the tap
            return removed ? nil : "Запись уже отправляется — если сервер её запишет, удали её в Mini App"
        } catch {
            return "Не удалилось: \(error.localizedDescription)"
        }
    }

    private static func write(_ text: String, to queue: CaptureQueue) async throws {
        try await queue.add(text)
        Task { await queue.flush() }
    }

    func sendNow() async {
        await services.queue.flush()
    }

    /// Keychain and the queue file open only after the first unlock: a launch before it is caught up here.
    func appBecameActive() async {
        isConfigured = services.settings.configuration() != nil
        await services.queue.flush()
    }

    /// The app was closed right after a phrase: iOS gives about half a minute to finish the request in flight, then
    /// the background refresh takes over. The refresh is asked for first — a sleeping PC keeps the request open past
    /// that half minute, and iOS suspends the app without running what comes after.
    func appMovedToBackground() async {
        // No recording in the background: a phrase cut off halfway is not written
        voice.cancel()
        let finishing = FinishingTime()
        let sending = Task { [queue = services.queue] in await queue.flush() }
        finishing.begin { [queue = services.queue] in
            // The call waiting for the queue goes first, so it does not start the stopped run again
            sending.cancel()
            Task { await queue.cancelSending() }
        }
        await services.background.schedule()
        await sending.value
        await services.background.schedule()
        finishing.end()
    }

    func saveSettings(address: String, token: String) async throws(SettingsError) {
        try services.settings.save(address: address, token: token)
        isConfigured = services.settings.configuration() != nil
        await services.queue.settingsChanged()
        Task { await services.queue.flush() }
    }

    func checkConnection(address: String) async -> String {
        guard let base = ServerAddress.normalized(address) else { return SettingsMessage.badAddress }
        switch await services.health.run(base: base) {
        case .available: return "Сервер доступен"
        case let .answered(status): return "Сервер ответил с ошибкой \(status)"
        case .unreachable: return "Не отвечает"
        }
    }
}

/// `beginBackgroundTask` for the request in flight. Out of time, iOS calls the handler, and the task must end right
/// there — an app that ends it later is killed.
@MainActor
private final class FinishingTime {
    private var task: UIBackgroundTaskIdentifier = .invalid

    func begin(onExpiration: @escaping @MainActor () -> Void) {
        task = UIApplication.shared.beginBackgroundTask(withName: "kapelka.finish-sending") { [self] in
            onExpiration()
            end()
        }
    }

    func end() {
        guard task != .invalid else { return }
        UIApplication.shared.endBackgroundTask(task)
        task = .invalid
    }
}

enum SettingsMessage {
    static let badAddress = "Нужен адрес вида https://пк.tailnet.ts.net (http — только localhost)"

    static func text(for error: SettingsError) -> String {
        switch error {
        case .badAddress: badAddress
        case .badToken: "Токен — латиница и цифры, без пробелов"
        case .noToken: "Вставь токен"
        case let .keychain(status): "Keychain не сохранил токен (код \(status))"
        }
    }
}
