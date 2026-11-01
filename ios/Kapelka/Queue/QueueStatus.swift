import Foundation

/// What the queue is doing, for «Отправить очередь» and «Записи». Under the microphone the card of the last phrase
/// says it (FT-252, `LastPhrase`).
enum QueueStatus {
    /// What «Отправить очередь» answers once it has sent what it could.
    static func afterSending(_ state: QueueState, configured: Bool) -> String {
        if let problem = problem(state, configured: configured) { return problem }
        let pending = pendingCount(state)
        return pending > 0 ? "В очереди: \(pending) — сервер пока недоступен" : "Всё отправлено"
    }

    /// The queue got a record onto the server between two states: «Записи» refresh (FT-220). «Не нашёл операцию»
    /// wrote nothing there.
    static func wroteRecords(from old: QueueState, to new: QueueState) -> Bool {
        let before = written(old)
        return !written(new).isSubset(of: before)
    }

    private static func written(_ state: QueueState) -> Set<UUID> {
        Set(state.captures.lazy.filter { $0.state == .sent && $0.reply?.status != "no_transaction" }.map(\.clientId))
    }

    static func pendingCount(_ state: QueueState) -> Int {
        state.captures.count { $0.state == .pending }
    }

    /// On the screen and in the notification of FT-253 alike.
    static let tokenRefusedText = "Сервер не принял токен — проверь токен в настройках Kapelka"

    private static func problem(_ state: QueueState, configured: Bool) -> String? {
        if !configured { return "Укажи адрес и токен в настройках Kapelka" }
        if state.tokenRefused { return tokenRefusedText }
        return nil
    }
}
