import Foundation

/// What the queue is doing, for «Отправить очередь», «Записи» and the payment's «уйдёт позже». Under the microphone
/// the card of the last phrase says it (FT-252, `LastPhrase`).
enum QueueStatus {
    /// What «Отправить очередь» answers once it has sent what it could: «В очереди: N — » and why, in the words of the
    /// payment's notice (#236).
    static func afterSending(_ state: QueueState, configured: Bool) -> String {
        if let problem = problem(state, configured: configured) { return problem }
        let pending = pendingCount(state)
        return pending > 0 ? "В очереди: \(pending) — \(whyLater(state))" : "Всё отправлено"
    }

    /// Why a record goes later, by the reason the queue kept (`QueueWait`), as the card on «Записать» says it (FT-252,
    /// FT-256): after the dash of the payment's notice and of «Отправить очередь» (#236). The settings and the token
    /// come before it, each with its own words.
    static func whyLater(_ state: QueueState) -> String {
        let busy = "сервер просит подождать, уйдёт позже"
        switch state.wait {
        case .offline?:
            return "нет связи, уйдёт, когда появится сеть"
        case .noAnswer?:
            return "сервер не ответил, уйдёт позже"
        case .busy?:
            return busy
        case nil:
            // No reason kept: not tried yet; the server answered the records before it in the same pass and the time
            // ran out on a long queue (#219); or a file of a build before FT-252 — there only a 429 leaves `notBefore`
            return state.notBefore == nil ? "уйдёт позже" : busy
        }
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
