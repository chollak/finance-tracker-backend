import Foundation

/// The card «Последняя фраза» on «Записать» (FT-252, decision 2026-10-31 «отклик на каждое действие»): the way of the
/// last phrase — «Услышал: …», «Отправляю…» — and what became of each of its records, from the answer the queue kept
/// (FT-255). It lives until the next phrase and says the same after a restart: the queue and `LastPhraseMarks` are on
/// disk. Only phrases: a payment answers with a haptic and a notification (FT-251, FT-253). In place of the queue's line
/// under the microphone; «Требует внимания» does not repeat its phrase.
struct LastPhrase: Equatable, Sendable {
    /// One line under «Услышал: …».
    struct Line: Equatable, Identifiable, Sendable {
        enum Kind: Equatable, Sendable {
            /// On the phone or on its way: «Отправляю…» with a `ProgressView`.
            case sending
            case offline
            case noAnswer
            /// 429: until `QueueState.notBefore`.
            case busy
            case notConfigured
            case tokenRefused
            case written
            /// «Записал, проверь».
            case review
            /// Deleted on the server, or taken off the phone.
            case deleted
            case withoutAmount
            case notFound
            /// 400.
            case refused
        }

        /// Under «Записал, проверь»: why the server is unsure, as far as the phone knows.
        enum Explanation: Equatable, Sendable {
            /// «Что я предположил» — a line per guess (FT-255, the lines of `RecordReview`).
            case assumed([String])
            /// No guesses kept — a repeat after a lost answer: the general phrase (`RecordReview.unsureText`).
            case unsure
        }

        let id: String
        let kind: Kind
        let text: String
        let explanation: Explanation?
        /// The record a tap opens in «Записи» (FT-254); `nil` for a line with no live record behind it.
        let record: String?

        var opens: OpenTarget? {
            record.map { OpenTarget(.records, record: $0) }
        }
    }

    /// What «Удалить» does in this state.
    enum Deletion: Equatable, Sendable {
        /// Waits on the phone: it goes from the phone and is never sent, as the swipe on «Записать» (FT-220).
        case fromPhone(UUID)
        /// Written: `DELETE` of each live record of the phrase, «Удалено N · Вернуть» on the bar (FT-221).
        case onServer([RecordsNotice.Item])
    }

    /// What the card's own «Удалить» could not do, said under the phrase while it still waits.
    struct Note: Equatable, Sendable {
        let clientId: UUID
        let text: String
        /// «Уже отправляется»: true only while that request is out — once it failed, «Удалить» works again (review of
        /// PR #171).
        var whileSending = false
    }

    /// What the card is built from besides the queue.
    struct Context {
        var configured: Bool
        var marks: LastPhraseMarks?
        /// `GET /api/accounts`, for a repeat that names no account (FT-255).
        var accountNames: [String: String] = [:]
        /// The records «Вернуть» on the bar brings back now: shown as written until the bar goes.
        var undoing: Set<String> = []
        /// The card's «Удалить» is on its way.
        var deleting = false
        /// The microphone is writing this phrase to the phone now.
        var saving: String?
        var note: Note?
        var now: Date
        var calendar: Calendar
    }

    /// The phrase's `clientId`; `nil` while the microphone is still writing it to the phone.
    let id: UUID?
    /// «Услышал: кофе 25к, такси» — what was said or typed.
    let heard: String
    let lines: [Line]
    /// Under the lines: what the card cannot know.
    let footnote: String?
    let note: String?
    /// «Удалить»; `nil` — no button: on its way, nothing left to delete.
    let deletion: Deletion?
    /// «Настройки»: no address and token, or the token refused.
    let opensSettings: Bool
    /// «Отправить сейчас»: it waits for a network or the server, and a try now may go.
    let offersSendNow: Bool

    /// What changes when the phrase moves on — a new phrase, «Отправляю…» → «Записал»: then the screen brings the card
    /// into sight over the keyboard (review of PR #171).
    var progress: [String] {
        [id?.uuidString ?? heard] + lines.map { "\($0.id) \($0.kind)" }
    }

    static let sendingText = "Отправляю…"
    static let notFoundText = "Не нашёл операцию — скажи с суммой, например: „кофе 25 тысяч“"
    static let repeatedFootnote = "Первый ответ потерялся — не знаю, было ли что-то без суммы"

    /// The last phrase in the queue, payments left out: added last, so the newest.
    static func capture(in state: QueueState) -> Capture? {
        state.captures.last { $0.payment == nil }
    }

    /// The phrase the card shows: the queue's last one, unless it or a newer one was taken off the phone (`nil` then).
    static func shownCapture(in state: QueueState, marks: LastPhraseMarks?) -> Capture? {
        guard let capture = capture(in: state), !isRemoved(capture, marks) else { return nil }
        return capture
    }

    /// Taken off the phone: this one — the queue's next state is not on the screen yet — or a newer one.
    private static func isRemoved(_ capture: Capture?, _ marks: LastPhraseMarks?) -> Bool {
        guard let marks, let removed = marks.removed else { return false }
        guard let capture else { return true }
        return marks.clientId == capture.clientId || removed.capturedAt > capture.capturedAt
    }

    static func of(_ state: QueueState, _ context: Context) -> LastPhrase? {
        let capture = capture(in: state)
        if let saving = context.saving, !isQueued(saving, capture) {
            return LastPhrase(id: nil, heard: heard(saving), lines: [sendingLine])
        }
        if let marks = context.marks, let removed = marks.removed, isRemoved(capture, marks) {
            return removedCard(marks.clientId, removed)
        }
        guard let capture else { return nil }
        switch capture.state {
        case .pending:
            return pending(capture, state, context)
        case .rejected:
            let line = Line(
                id: "refused",
                kind: .refused,
                text: "Не записал: \(RejectionText.shown(for: capture.rejection))",
                explanation: nil,
                record: nil
            )
            return LastPhrase(id: capture.clientId, heard: heard(capture.text), lines: [line])
        case .sent:
            return written(capture, context)
        }
    }

    // MARK: On the phone

    private static let sendingLine = Line(id: "way", kind: .sending, text: sendingText, explanation: nil, record: nil)

    /// The microphone's phrase is in the queue already: the queue's card, so «Требует внимания» does not show it too.
    private static func isQueued(_ saving: String, _ capture: Capture?) -> Bool {
        guard let capture, capture.state == .pending, capture.attempts == 0 else { return false }
        return capture.text == saving.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func pending(_ capture: Capture, _ state: QueueState, _ context: Context) -> LastPhrase {
        let removable = Deletion.fromPhone(capture.clientId)
        let note = context.note.flatMap { note in
            note.clientId == capture.clientId && (!note.whileSending || state.sendingId == capture.clientId)
                ? note.text : nil
        }
        func card(_ kind: Line.Kind, _ text: String, settings: Bool = false, sendNow: Bool = false) -> LastPhrase {
            LastPhrase(
                id: capture.clientId,
                heard: heard(capture.text),
                lines: [Line(id: "way", kind: kind, text: text, explanation: nil, record: nil)],
                note: note,
                deletion: removable,
                opensSettings: settings,
                offersSendNow: sendNow
            )
        }
        // On its way: no «Удалить» — a timeout would not say whether the server wrote it
        let sending = LastPhrase(id: capture.clientId, heard: heard(capture.text), lines: [sendingLine], note: note)
        // One request at a time, oldest first: one out now means this one goes in the same pass
        if state.sendingId != nil { return sending }
        if !context.configured { return card(.notConfigured, "Укажи адрес и токен", settings: true) }
        if state.tokenRefused { return card(.tokenRefused, "Сервер не принял токен", settings: true) }
        if let notBefore = state.notBefore, notBefore > context.now {
            let time = RussianDate.formatter("HH:mm", context.calendar).string(from: notBefore)
            return card(.busy, "Сервер просит подождать — уйдёт в \(time)")
        }
        // Never tried and first in line: the reason is an older attempt's — a phrase taken off the phone, other
        // settings — and this one goes now. Behind a waiting record it waits for the same reason
        let waitsBehind = state.captures.prefix { $0.clientId != capture.clientId }.contains { $0.state == .pending }
        if capture.attempts == 0, !waitsBehind { return sending }
        let noAnswer = "Сервер не ответил — уйдёт позже"
        switch state.wait {
        case .offline?:
            return card(.offline, "Нет связи — уйдёт, когда появится сеть", sendNow: true)
        case .noAnswer?:
            return card(.noAnswer, noAnswer, sendNow: true)
        case .busy?:
            // The pause is over: the queue sends it now
            return sending
        case nil:
            // Went before, and the file does not say why (a build before FT-252)
            return card(.noAnswer, noAnswer, sendNow: true)
        }
    }

    private static func removedCard(_ clientId: UUID, _ removed: LastPhraseMarks.Removed) -> LastPhrase {
        let text = removed.triedBefore
            ? "Удалено с телефона — она уже уходила на сервер, проверь «Записи»"
            : "Удалено с телефона"
        let line = Line(id: "removed", kind: .deleted, text: text, explanation: nil, record: nil)
        return LastPhrase(id: clientId, heard: heard(removed.text), lines: [line])
    }

    // MARK: The server's answer

    private static func written(_ capture: Capture, _ context: Context) -> LastPhrase {
        let reply = capture.reply ?? CaptureReply(status: "saved", title: "Записал", summary: "")
        let marked = context.marks?.clientId == capture.clientId ? context.marks?.deleted ?? [] : []
        var lines: [Line] = []
        var live: [RecordsNotice.Item] = []
        for record in reply.records {
            let line = text(of: record, accountNames: context.accountNames)
            if record.isDeleted || (marked.contains(record.id) && !context.undoing.contains(record.id)) {
                lines.append(Line(id: record.id, kind: .deleted, text: "Удалено: \(line)", explanation: nil, record: nil))
                continue
            }
            // Deleted, «Вернуть» still on the bar: as written until the bar goes, nothing to open or delete
            let offered = marked.contains(record.id)
            lines.append(Line(
                id: record.id,
                kind: record.needsReview ? .review : .written,
                text: "\(WrittenText.title(needsReview: record.needsReview)): \(line)",
                explanation: record.needsReview ? explanation(of: record) : nil,
                record: offered ? nil : record.id
            ))
            if !offered {
                live.append(RecordsNotice.Item(id: record.id, title: title(of: record)))
            }
        }
        lines += unwritten(reply)
        return LastPhrase(
            id: capture.clientId,
            heard: heard(capture.text),
            lines: lines,
            footnote: lostDetails(reply) ? repeatedFootnote : nil,
            deletion: live.isEmpty || context.deleting ? nil : .onServer(live)
        )
    }

    /// A repeat read from the database: no account names, guesses or «без суммы» (FT-255). A repeat that came while the
    /// first request was still written carries the first's whole answer (`quickCaptureService.ts`, `once`) — the
    /// account names or «без суммы» in it tell it apart (review of PR #171).
    private static func lostDetails(_ reply: CaptureReply) -> Bool {
        reply.repeated && reply.withoutAmount.isEmpty && reply.records.allSatisfy { $0.accountName == nil }
    }

    /// «без суммы» and «не нашёл»; an answer of a server before FT-255 — its ack alone.
    private static func unwritten(_ reply: CaptureReply) -> [Line] {
        let names = reply.withoutAmount.map(\.description).filter { !$0.isEmpty }
        if !names.isEmpty {
            let text = "Без суммы, не записал: \(names.joined(separator: ", ")) — скажи с суммой"
            return [Line(id: "without-amount", kind: .withoutAmount, text: text, explanation: nil, record: nil)]
        }
        guard reply.records.isEmpty else { return [] }
        if reply.status == "no_transaction" {
            return [Line(id: "not-found", kind: .notFound, text: notFoundText, explanation: nil, record: nil)]
        }
        let review = reply.status == "needs_review"
        let text = reply.summary.isEmpty
            ? WrittenText.title(needsReview: review)
            : "\(WrittenText.title(needsReview: review)): \(reply.summary)"
        return [Line(id: "ack", kind: review ? .review : .written, text: text, explanation: nil, record: nil)]
    }

    /// «кофе · Кафе · −25 000 сум · Карта»: the line of the notices (`WrittenText`) and the account — by name from the
    /// answer, by `accountId` after a repeat, or none.
    private static func text(of record: CapturedRecord, accountNames: [String: String]) -> String {
        let account = record.accountName ?? record.accountId.flatMap { accountNames[$0] }
        return [WrittenText.line(record), account].compactMap { $0 }.joined(separator: " · ")
    }

    /// The guesses of the answer, whenever they came — a repeat from the database has none (FT-255); none — the general
    /// phrase.
    private static func explanation(of record: CapturedRecord) -> Line.Explanation {
        let assumed = RecordReview.lines(record.assumptions, category: record.category)
        return assumed.isEmpty ? .unsure : .assumed(assumed)
    }

    /// For «Не удалил «хлеб» — нет связи»: the note, else the category, as a row of «Записи» names it.
    private static func title(of record: CapturedRecord) -> String {
        let note = record.description.trimmingCharacters(in: .whitespacesAndNewlines)
        return note.isEmpty ? record.category : note
    }

    private static func heard(_ text: String) -> String {
        "Услышал: \(text)"
    }

    private init(
        id: UUID?,
        heard: String,
        lines: [Line],
        footnote: String? = nil,
        note: String? = nil,
        deletion: Deletion? = nil,
        opensSettings: Bool = false,
        offersSendNow: Bool = false
    ) {
        self.id = id
        self.heard = heard
        self.lines = lines
        self.footnote = footnote
        self.note = note
        self.deletion = deletion
        self.opensSettings = opensSettings
        self.offersSendNow = offersSendNow
    }
}
