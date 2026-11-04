import Foundation

/// The journal's words (#241): short, for the screen and for the text sent to the chat. A payment's merchant and
/// amount are in it — the journal stays on the phone.
enum JournalText {
    /// «Записать трату» asked the screen to listen; the screen takes it once it is on and active.
    static let waitingForScreen = "жду экран"
    static let noticePosted = "уведомление поставлено"
    /// The pass told the server's answer itself (FT-253), or nothing needed telling.
    static let noOwnNotice = "без своего уведомления"

    /// The screen took a press of «Записать трату» (`ExpenseRuns`): what the press does to the microphone.
    static func pressed(_ phase: VoiceCapture.Phase) -> String {
        switch phase {
        case .idle: "слушаю"
        case .listening: "заканчиваю фразу"
        case .starting: "отменяю: микрофон ещё включался"
        case .finishing, .saving: "фраза уже записывается"
        }
    }

    /// The microphone is done and wrote nothing for the press.
    static func noPhrase(_ problem: VoiceProblem?) -> String {
        problem.map { "без фразы: \($0.message)" } ?? "без фразы"
    }

    /// «Отправить очередь» before sending.
    static func pending(_ count: Int) -> String {
        "ждут: \(count)"
    }

    /// «Отправить очередь» answers with a dialog, not a notification.
    static func dialog(_ report: String) -> String {
        "окно: «\(report)»"
    }

    /// «в очереди · <clientId> · KORZINKA 24 · 25 000,00 UZS»; a phrase by its `clientId` only.
    static func queued(_ capture: Capture) -> String {
        let id = capture.clientId.uuidString
        guard let payment = capture.payment else { return "фраза в очереди · \(id)" }
        return "в очереди · \(id) · \(payment.line)"
    }

    /// A payment refused on the phone: nothing goes to the server.
    static func notSent(_ capture: Capture) -> String {
        "не отправляется: \(RejectionText.shown(for: capture.rejection))"
    }

    /// What became of one record once the send is over.
    static func sent(_ clientId: UUID, _ state: QueueState, configured: Bool) -> String {
        guard let capture = state.captures.first(where: { $0.clientId == clientId }) else {
            return "отправка: запись удалена"
        }
        switch capture.state {
        case .sent:
            return capture.reply?.status == "no_transaction" ? "отправка: не нашёл операцию" : "отправка: записано"
        case .rejected:
            return "отправка: сервер отказал"
        case .pending:
            return "отправка: \(waiting(state, configured: configured))"
        }
    }

    /// «Отправить очередь»: the whole queue.
    static func queueSent(before: QueueState, after: QueueState, configured: Bool) -> String {
        guard QueueStatus.pendingCount(before) > 0 else { return "отправка: нечего отправлять" }
        let pending = QueueStatus.pendingCount(after)
        guard pending > 0 else { return "отправка: всё отправлено" }
        return "отправка: ждут \(pending) — \(waiting(after, configured: configured))"
    }

    /// Why a record still waits, as the queue keeps it (`QueueWait`, FT-252, FT-256).
    private static func waiting(_ state: QueueState, configured: Bool) -> String {
        if !configured { return "не настроено" }
        if state.tokenRefused { return "токен не принят" }
        switch state.wait {
        case .offline?:
            return "нет связи"
        case .noAnswer?:
            return "сервер не ответил"
        case .busy?:
            return "сервер просит подождать"
        case nil:
            // The server answered the records before it, and the time ran out on this one (#219)
            return state.notBefore == nil ? "не успела, уйдёт позже" : "сервер просит подождать"
        }
    }

    /// «640 мс», «1,8 с», «1 мин 5 с». Under a second the milliseconds themselves; the file keeps them all.
    static func duration(ms: Int) -> String {
        if ms < 1000 { return "\(ms)\u{00A0}мс" }
        let tenths = (ms + 50) / 100
        if tenths < 600 { return "\(tenths / 10),\(tenths % 10)\u{00A0}с" }
        let seconds = (ms + 500) / 1000
        return "\(seconds / 60)\u{00A0}мин \(seconds % 60)\u{00A0}с"
    }

    static func outcome(_ outcome: JournalRun.Outcome) -> String {
        switch outcome {
        case .going: "идёт"
        case let .finished(ms): "конец · \(duration(ms: ms))"
        case let .failed(ms, message): "ошибка: \(message) · \(duration(ms: ms))"
        case let .interrupted(lastStep): "оборвана iOS после шага «\(lastStep)»"
        }
    }

    /// «3 нояб., 08:05:12 · Записать оплату».
    static func title(_ run: JournalRun, calendar: Calendar) -> String {
        "\(startTime(run.startedAt, calendar: calendar)) · \(run.command.title)"
    }

    /// What «Поделиться» sends: every run, newest first, each with its steps.
    static func shared(_ runs: [JournalRun], calendar: Calendar) -> String {
        let header = "Журнал команд Kapelka · запусков: \(runs.count), новые сверху"
        let blocks = runs.map { run in
            let steps = run.steps.map { "  \(duration(ms: $0.ms)) · \($0.text)" }
            return (["\(title(run, calendar: calendar)) — \(outcome(run.outcome))"] + steps).joined(separator: "\n")
        }
        return ([header] + blocks).joined(separator: "\n\n")
    }

    private static func startTime(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate("d MMM HH:mm:ss")
        return formatter.string(from: date)
    }
}
