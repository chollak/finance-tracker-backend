import Foundation
import Observation
import UIKit

/// What the screens show and do; the work itself is in `AppServices`.
@MainActor
@Observable
final class AppModel {
    let services: AppServices
    private(set) var queueState: QueueState
    private(set) var isConfigured: Bool

    init(services: AppServices) {
        self.services = services
        queueState = QueueState()
        isConfigured = services.settings.configuration() != nil
        Task { [weak self, updates = services.queue.updates] in
            for await state in updates {
                self?.queueState = state
            }
        }
    }

    var pendingCount: Int {
        queueState.captures.count { $0.state == .pending }
    }

    var hasToken: Bool {
        services.settings.hasToken
    }

    /// The line under the field: what happens to the queue now.
    var statusLine: String {
        if !isConfigured { return "Укажи адрес и токен в настройках" }
        if queueState.tokenRefused { return "Сервер не принял токен — проверь токен в настройках" }
        if pendingCount > 0 { return "В очереди: \(pendingCount)" }
        guard let last = queueState.captures.last else { return "Очередь пуста" }
        switch last.state {
        case .sent: return [last.reply?.title, last.reply?.summary].compactMap { $0 }.joined(separator: " · ")
        case .rejected: return "Не записано: \(last.rejection ?? "сервер не принял запись")"
        case .pending: return "В очереди: \(pendingCount)"
        }
    }

    /// The phrase is on disk when this returns; sending goes on by itself.
    func add(_ text: String) async throws {
        try await services.queue.add(text)
        Task { await services.queue.flush() }
    }

    func sendNow() async {
        await services.queue.flush()
    }

    func appBecameActive() async {
        await services.queue.flush()
    }

    /// The app was closed right after a phrase: iOS gives about half a minute to finish the request in flight, then
    /// the background refresh takes over.
    func appMovedToBackground() async {
        let finishing = FinishingTime()
        finishing.begin { [queue = services.queue] in
            Task { await queue.cancelSending() }
        }
        await services.queue.flush()
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
    static let badAddress = "Не похоже на адрес: нужен вида https://пк.tailnet.ts.net"

    static func text(for error: SettingsError) -> String {
        switch error {
        case .badAddress: badAddress
        case .badToken: "Токен — латиница и цифры, без пробелов"
        case .noToken: "Вставь токен"
        case let .keychain(status): "Keychain не сохранил токен (код \(status))"
        }
    }
}
