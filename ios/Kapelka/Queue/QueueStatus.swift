/// One line on what the queue is doing, for the screen and for «Отправить очередь».
enum QueueStatus {
    /// Under the microphone: the answer to the last phrase — the server's summary or «в очереди N».
    static func line(for state: QueueState, configured: Bool) -> String {
        if let problem = problem(state, configured: configured) { return problem }
        let pending = pendingCount(state)
        if pending > 0 { return "В очереди: \(pending)" }
        guard let last = state.captures.last else { return "Очередь пуста" }
        switch last.state {
        case .sent: return [last.reply?.title, last.reply?.summary].compactMap { $0 }.joined(separator: " · ")
        case .rejected: return "Не записано: \(RejectionText.shown(for: last.rejection))"
        case .pending: return "В очереди: \(pending)"
        }
    }

    /// What «Отправить очередь» answers once it has sent what it could.
    static func afterSending(_ state: QueueState, configured: Bool) -> String {
        if let problem = problem(state, configured: configured) { return problem }
        let pending = pendingCount(state)
        return pending > 0 ? "В очереди: \(pending) — сервер пока недоступен" : "Всё отправлено"
    }

    /// What «Записать оплату» answers about its payment once it has tried to send it.
    static func afterPayment(_ capture: Capture, _ state: QueueState, configured: Bool) -> String {
        switch capture.state {
        case .sent:
            return [capture.reply?.title, capture.reply?.summary].compactMap { $0 }.joined(separator: " · ")
        case .rejected:
            return "Не записано: \(RejectionText.shown(for: capture.rejection))"
        case .pending:
            if let problem = problem(state, configured: configured) { return "Оплата в очереди. \(problem)" }
            return "Оплата в очереди: уйдёт, когда сервер будет доступен"
        }
    }

    static func pendingCount(_ state: QueueState) -> Int {
        state.captures.count { $0.state == .pending }
    }

    private static func problem(_ state: QueueState, configured: Bool) -> String? {
        if !configured { return "Укажи адрес и токен в настройках Kapelka" }
        if state.tokenRefused { return "Сервер не принял токен — проверь токен в настройках Kapelka" }
        return nil
    }
}
