import Foundation

/// The journal's words (#241): short, for the screen and for the text sent to the chat. A payment's merchant and
/// amount are in it — the journal stays on the phone.
enum JournalText {
    /// «Записать трату» asked the screen to listen; the screen takes it once it is on and active.
    static let waitingForScreen = "жду экран"
    static let noticePosted = "уведомление поставлено"
    /// The pass told the server's answer itself (FT-253), or nothing needed telling.
    static let noOwnNotice = "без своего уведомления"
    /// The command's own task was cancelled by its end: iOS stopped `perform` and left the process alive.
    static let cancelled = "iOS отменил команду"

    /// «холодный запуск · 340 мс от старта процесса»: the process was started for this command, or it already ran.
    static func launch(_ launch: JournalLaunch) -> String {
        let kind = launch.cold ? "холодный запуск" : "процесс уже работал"
        guard let ms = launch.sinceProcessStartMs else { return kind }
        return "\(kind) · \(duration(ms: ms)) от старта процесса"
    }

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

    /// For the screen: «640 мс», «1,8 с», «1 мин 5 с», «2 ч 5 мин». Under a second the milliseconds themselves; the
    /// file and «Поделиться» keep them all (`exact`).
    static func duration(ms: Int) -> String {
        if ms < 1000 { return "\(ms)\u{00A0}мс" }
        let tenths = (ms + 50) / 100
        if tenths < 600 { return "\(tenths / 10),\(tenths % 10)\u{00A0}с" }
        let seconds = (ms + 500) / 1000
        if seconds < 3600 { return "\(seconds / 60)\u{00A0}мин \(seconds % 60)\u{00A0}с" }
        return "\(seconds / 3600)\u{00A0}ч \(seconds % 3600 / 60)\u{00A0}мин"
    }

    /// For «Поделиться»: «1834 мс», as the Definition of Done asks — the 25 s budget is read to the millisecond.
    static func exact(ms: Int) -> String {
        "\(ms)\u{00A0}мс"
    }

    /// How the run ended; `exact` gives its time in milliseconds.
    static func outcome(_ outcome: JournalRun.Outcome, exact: Bool = false) -> String {
        let time: (Int) -> String = exact ? { Self.exact(ms: $0) } : { duration(ms: $0) }
        return switch outcome {
        case .going: "идёт"
        case let .finished(ms): "конец · \(time(ms))"
        case let .failed(ms, message): "ошибка: \(message) · \(time(ms))"
        case let .interrupted(lastStep): "оборвана iOS после шага «\(lastStep)»"
        }
    }

    /// «3 нояб., 08:05:12 · Записать оплату».
    static func title(_ run: JournalRun, calendar: Calendar) -> String {
        "\(format(run.startedAt, "d MMM HH:mm:ss", calendar)) · \(run.command.title)"
    }

    /// «Kapelka 0.1 (1), собрана 4 нояб., 14:40 · iOS 26.1».
    static func build(_ build: AppBuild, calendar: Calendar) -> String {
        let built = build.builtAt.map { ", собрана \(format($0, "d MMM HH:mm", calendar))" } ?? ""
        return "Kapelka \(build.version) (\(build.build))\(built) · \(build.system)"
    }

    /// What «Поделиться» sends: the build and iOS, then every run, newest first — how the process stood at its start,
    /// each step and the end with their times in milliseconds.
    static func shared(_ runs: [JournalRun], calendar: Calendar, build: AppBuild) -> String {
        let header = "Журнал команд Kapelka · запусков: \(runs.count), новые сверху\n\(Self.build(build, calendar: calendar))"
        let blocks = runs.map { run in
            let launch = run.launch.map { ["  \(Self.launch($0))"] } ?? []
            let steps = run.steps.map { "  \(exact(ms: $0.ms)) · \($0.text)" }
            let heading = "\(title(run, calendar: calendar)) — \(outcome(run.outcome, exact: true))"
            return ([heading] + launch + steps).joined(separator: "\n")
        }
        return ([header] + blocks).joined(separator: "\n\n")
    }

    private static func format(_ date: Date, _ template: String, _ calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }
}
