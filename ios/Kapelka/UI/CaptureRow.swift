import Foundation

/// One line of the queue's list on «Записать»: what happened to it, when it was said, and what it says.
struct CaptureRow: Identifiable, Equatable {
    enum Kind: Equatable, Sendable {
        case waiting
        /// Its request is out now.
        case sending
        case saved
        case needsReview
        /// The server found no amount or operation in the phrase.
        case notFound
        /// The server refused the record (400).
        case error

        var systemImage: String {
            switch self {
            case .waiting: "clock"
            case .sending: "arrow.up.circle"
            case .saved: "checkmark"
            case .needsReview: "exclamationmark.circle"
            case .notFound: "questionmark.circle"
            case .error: "xmark.circle"
            }
        }

        /// Shown on «Записать» (FT-220): what is not on the server yet or never will be. A written record is in
        /// «Записи», with what the server has now.
        var needsAttention: Bool {
            switch self {
            case .waiting, .sending, .error, .notFound: true
            case .saved, .needsReview: false
            }
        }
    }

    let id: UUID
    let kind: Kind
    /// «Ждёт · 14:32», «Записал · 14:32», «Ждёт · 14:32 · Apple Pay».
    let status: String
    /// The server's summary for a written record, the phrase or the payment as Wallet gave it otherwise.
    let text: String
    /// Why the server refused it.
    let reason: String?

    /// Only a waiting record is deleted on the phone. One on its way may already be written, and a written one is
    /// changed in the Mini App.
    var canDelete: Bool { kind == .waiting }

    /// «Убрать»: the server wrote nothing for it, so it only leaves the phone (FT-220).
    var canDismiss: Bool { kind == .notFound || kind == .error }

    /// Newest first.
    static func rows(_ captures: [Capture], sendingId: UUID?, now: Date, calendar: Calendar) -> [CaptureRow] {
        let time = TimeOfInput(now: now, calendar: calendar)
        return captures
            .sorted { $0.capturedAt > $1.capturedAt }
            .map { row(for: $0, isSending: $0.clientId == sendingId, time: time) }
    }

    /// The rows of «Записать»: waiting, sending, refused, «не нашёл операцию» — newest first. «Не нашёл операцию» wrote
    /// nothing on the server, so it stays here. `excluding`: the phrase of the card above (FT-252) — one answer on the
    /// screen once.
    static func needingAttention(
        _ captures: [Capture],
        sendingId: UUID?,
        now: Date,
        calendar: Calendar,
        excluding: UUID? = nil
    ) -> [CaptureRow] {
        rows(captures.filter { $0.clientId != excluding }, sendingId: sendingId, now: now, calendar: calendar)
            .filter(\.kind.needsAttention)
    }

    private static func row(for capture: Capture, isSending: Bool, time: TimeOfInput) -> CaptureRow {
        let kind = isSending ? .sending : kind(of: capture)
        // A payment shows what Wallet gave until the server's summary comes
        let said = capture.payment?.line ?? capture.text
        let label: String
        let text: String
        switch kind {
        case .waiting:
            label = "Ждёт"
            text = said
        case .sending:
            label = "Отправляю"
            text = said
        case .saved, .needsReview:
            label = capture.reply?.title ?? "Записал"
            text = capture.reply?.summary ?? said
        case .notFound:
            label = capture.reply?.title ?? "Не нашёл операцию"
            text = said
        case .error:
            // Refused by the phone itself: another currency, no amount
            label = capture.payment != nil && capture.attempts == 0 ? "Не отправлено" : "Ошибка"
            text = said
        }
        let status = [label, time.shown(capture.capturedAt), capture.payment == nil ? nil : "Apple Pay"]
        return CaptureRow(
            id: capture.clientId,
            kind: kind,
            status: status.compactMap { $0 }.joined(separator: " · "),
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
