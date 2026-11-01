import Foundation
import Observation
import UIKit

/// What the screens show and do; the work itself is in `AppServices`.
@MainActor
@Observable
final class AppModel {
    let services: AppServices
    let voice: VoiceCapture
    /// The tab «Записи» (FT-220).
    let records: RecordsList
    private(set) var queueState: QueueState
    private(set) var isConfigured: Bool

    init(services: AppServices, speech: AppleSpeech = AppleSpeech()) {
        self.services = services
        let feedback = services.feedback
        voice = VoiceCapture(system: speech, listener: speech, feedback: feedback.happened) { [queue = services.queue] phrase in
            try await Self.write(phrase, to: queue)
        }
        // With VoiceOver on the bar of «Записи» stays until it is closed: 5 s is too short to reach «Вернуть»
        records = RecordsList(
            feed: services.records,
            keepsNotices: { UIAccessibility.isVoiceOverRunning },
            feedback: feedback.happened
        )
        queueState = QueueState()
        isConfigured = services.settings.configuration() != nil
        Task { [weak self, updates = services.queue.updates] in
            // The first state is the file as it was read: nothing was sent yet
            var previous: QueueState?
            for await state in updates {
                if let previous, QueueStatus.wroteRecords(from: previous, to: state) {
                    Task { await self?.records.queueWroteRecords() }
                }
                previous = state
                self?.queueState = state
            }
        }
    }

    var pendingCount: Int {
        QueueStatus.pendingCount(queueState)
    }

    /// The queue's rows on «Записать», newest first: only what is not in «Записи».
    var attentionRows: [CaptureRow] {
        CaptureRow.needingAttention(queueState.captures, sendingId: queueState.sendingId, now: Date(), calendar: .current)
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

    /// A waiting record goes, never sent; `nil` or what to tell.
    func remove(_ id: UUID) async -> String? {
        let triedBefore = queueState.captures.first { $0.clientId == id }.map { $0.attempts > 0 } ?? false
        do {
            let removed = try await services.queue.remove(id)
            // Its request went out between the swipe and the tap
            guard removed else { return "Запись уже отправляется — если сервер её запишет, удали её в Mini App" }
            // A timeout says nothing about whether the server wrote it
            return triedBefore ? "Удалено. Запись уже уходила на сервер — проверь Mini App" : nil
        } catch {
            return "Не удалилось: \(error.localizedDescription)"
        }
    }

    /// «Убрать» a row the server wrote nothing for; `nil` or what to tell.
    func dismiss(_ id: UUID) async -> String? {
        do {
            _ = try await services.queue.dismiss(id)
            return nil
        } catch {
            return "Не убралось: \(error.localizedDescription)"
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

    /// The app left the screen. What the microphone heard is written first (decision 2026-10-30), then the queue is sent
    /// within the half minute iOS gives. The refresh is asked for first: a sleeping PC keeps the request open past that
    /// half minute, and iOS suspends the app without running what comes after. Out of time, this call stops the run;
    /// another call still waiting for the queue (a new network path, the phrase's own send) may start it again, and iOS
    /// suspends the app mid-request — the record goes again later with the same `clientId`.
    func appMovedToBackground() async {
        let finishing = FinishingTime()
        let sending = Task { [voice, queue = services.queue] in
            await voice.wrapUp()
            await queue.flush()
        }
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

    /// Wallet cards → Kapelka accounts, in the order the cards first paid (FT-179).
    var cards: [CardAccount] {
        services.cards.cards
    }

    /// Every field is checked before any is written. A payment waiting on the phone goes with the new account; a card's
    /// currency counts from the next payment, since a payment's amount is read when it lands in the queue.
    func saveSettings(
        address: String,
        token: String,
        cards: [CardAccount],
        removedCards: Set<String>
    ) async throws(SettingsError) {
        do {
            try CardAccountStore.check(cards)
        } catch {
            switch error {
            case let .tooLong(card): throw .accountTooLong(card: card)
            }
        }
        try services.settings.save(address: address, token: token)
        // Checked above, so it does not throw here
        try? services.cards.save(cards, removing: removedCards)
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
        case let .accountTooLong(card): "Счёт для «\(card)» длиннее \(CardAccountStore.accountLimit) символов"
        }
    }
}
