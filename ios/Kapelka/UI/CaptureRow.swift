import Foundation

/// One line of the list of recent records: what happened to it, when it was said, and what it says.
struct CaptureRow: Identifiable, Equatable {
    enum Kind: Equatable, Sendable {
        case waiting
        case saved
        case needsReview
        /// The server found no amount or operation in the phrase.
        case notFound
        /// The server refused the record (400).
        case error

        var systemImage: String {
            switch self {
            case .waiting: "clock"
            case .saved: "checkmark"
            case .needsReview: "exclamationmark.circle"
            case .notFound: "questionmark.circle"
            case .error: "xmark.circle"
            }
        }
    }

    let id: UUID
    let kind: Kind
    /// «Ждёт · 14:32», «Записал · 14:32».
    let status: String
    /// The server's summary for a written record, the phrase otherwise.
    let text: String
    /// Why the server refused it.
    let reason: String?

    /// Only a waiting record is deleted on the phone; a written one is changed in the Mini App.
    var canDelete: Bool { kind == .waiting }

    /// Newest first.
    static func rows(_ captures: [Capture], now: Date, calendar: Calendar) -> [CaptureRow] {
        let time = TimeOfInput(now: now, calendar: calendar)
        return captures
            .sorted { $0.capturedAt > $1.capturedAt }
            .map { row(for: $0, time: time) }
    }

    private static func row(for capture: Capture, time: TimeOfInput) -> CaptureRow {
        let kind = kind(of: capture)
        let label: String
        let text: String
        switch kind {
        case .waiting:
            label = "Ждёт"
            text = capture.text
        case .saved, .needsReview:
            label = capture.reply?.title ?? "Записал"
            text = capture.reply?.summary ?? capture.text
        case .notFound:
            label = capture.reply?.title ?? "Не нашёл операцию"
            text = capture.text
        case .error:
            label = "Ошибка"
            text = capture.text
        }
        return CaptureRow(
            id: capture.clientId,
            kind: kind,
            status: "\(label) · \(time.shown(capture.capturedAt))",
            text: text,
            reason: kind == .error ? RejectionText.shown(for: capture.rejection) : nil
        )
    }

    private static func kind(of capture: Capture) -> Kind {
        switch capture.state {
        case .pending: .waiting
        case .rejected: .error
        case .sent:
            switch capture.reply?.status {
            case "needs_review": .needsReview
            case "no_transaction": .notFound
            default: .saved
            }
        }
    }
}

/// «14:32» today, «29 окт., 14:32» on another day.
private struct TimeOfInput {
    let now: Date
    let calendar: Calendar
    let clock: DateFormatter
    let day: DateFormatter

    init(now: Date, calendar: Calendar) {
        self.now = now
        self.calendar = calendar
        clock = Self.formatter(template: "HH:mm", calendar: calendar)
        day = Self.formatter(template: "d MMM HH:mm", calendar: calendar)
    }

    func shown(_ date: Date) -> String {
        calendar.isDate(date, inSameDayAs: now) ? clock.string(from: date) : day.string(from: date)
    }

    private static func formatter(template: String, calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter
    }
}
