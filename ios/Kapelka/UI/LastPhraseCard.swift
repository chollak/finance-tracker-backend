import Foundation
import Observation

/// What the card «Последняя фраза» (FT-252) keeps and does besides the queue: «Удалить» by the phrase's state, the
/// phrase's records deleted on the server (`LastPhraseMarks`, on disk), and the account names after a lost answer.
/// «Удалить» of written records goes through «Записи»' own list (`RecordsList.delete`): «Записи» hide them, and its bar
/// — shown on both tabs — offers «Вернуть» for all of them. The list tells back what the server deleted and gave back
/// (`RecordsList.changed`), a swipe in «Записи» too.
@MainActor
@Observable
final class LastPhraseCard {
    private var state = QueueState()
    private var marks: LastPhraseMarks?
    private var accountNames: [String: String] = [:]
    private var deleting = false
    private var note: LastPhrase.Note?
    /// The phrase whose account names came: once per phrase. One that did not come is asked again on the next state of
    /// the queue (review of PR #171).
    @ObservationIgnored private var namedAccounts: UUID?
    /// `GET /api/accounts` is on its way: the states meanwhile ask nothing more.
    @ObservationIgnored private var askingAccounts = false

    @ObservationIgnored private let queue: CaptureQueue
    @ObservationIgnored private let records: RecordsList
    @ObservationIgnored private let memory: LastPhraseMemory
    @ObservationIgnored private let accounts: @Sendable () async -> [RecordAccount]?

    /// `accounts`: `GET /api/accounts`, `nil` when they did not come.
    init(
        queue: CaptureQueue,
        records: RecordsList,
        memory: LastPhraseMemory,
        accounts: @escaping @Sendable () async -> [RecordAccount]?
    ) {
        self.queue = queue
        self.records = records
        self.memory = memory
        self.accounts = accounts
        marks = memory.marks
        records.changed = { [weak self] change in self?.recordsChanged(change) }
    }

    /// Each state of the queue, as the screen gets it.
    func queueChanged(_ state: QueueState) {
        self.state = state
        askAccountNamesIfNeeded()
    }

    /// The card now; `nil` before the first phrase. `saving`: the microphone writes this phrase to the phone now.
    func shown(configured: Bool, saving: String?, now: Date, calendar: Calendar) -> LastPhrase? {
        LastPhrase.of(state, LastPhrase.Context(
            configured: configured,
            marks: marks,
            accountNames: accountNames,
            undoing: Set(records.notice?.restorable ?? []),
            deleting: deleting,
            saving: saving,
            note: note,
            now: now,
            calendar: calendar
        ))
    }

    /// «Удалить» as the card offered it.
    func delete(_ deletion: LastPhrase.Deletion) async {
        switch deletion {
        case let .fromPhone(clientId):
            await removeFromPhone(clientId)
        case let .onServer(items):
            deleting = true
            await records.delete(items)
            deleting = false
        }
    }

    /// As the swipe «Удалить» on «Записать»: a phrase whose request went out meanwhile stays — the server may write it.
    private func removeFromPhone(_ clientId: UUID) async {
        guard let capture = state.captures.first(where: { $0.clientId == clientId }) else { return }
        do {
            guard try await queue.remove(clientId) else {
                note = LastPhrase.Note(
                    clientId: clientId,
                    text: "Уже отправляется — удалить можно, когда запишется",
                    whileSending: true
                )
                return
            }
            let removed = LastPhraseMarks.Removed(
                text: capture.text,
                capturedAt: capture.capturedAt,
                triedBefore: capture.attempts > 0
            )
            remember(LastPhraseMarks(clientId: clientId, removed: removed))
        } catch {
            note = LastPhrase.Note(clientId: clientId, text: "Не удалилось: \(error.localizedDescription)")
        }
    }

    /// The records of the card's phrase among those the server deleted or gave back.
    private func recordsChanged(_ change: RecordsChange) {
        guard let capture = LastPhrase.shownCapture(in: state, marks: marks), let reply = capture.reply else { return }
        let mine = Set(reply.records.map(\.id))
        // Marks of an older phrase go with the first change of this one
        var next = LastPhraseMarks(clientId: capture.clientId)
        if let marks, marks.clientId == capture.clientId {
            next = marks
        }
        switch change {
        case let .deleted(ids):
            let deleted = mine.intersection(ids)
            guard !deleted.isEmpty else { return }
            next.deleted.formUnion(deleted)
        case let .restored(ids):
            let restored = mine.intersection(ids)
            guard !restored.isEmpty else { return }
            next.deleted.subtract(restored)
        }
        remember(next)
    }

    private func remember(_ next: LastPhraseMarks) {
        marks = next
        memory.marks = next
    }

    /// A repeat after a lost answer names no account (FT-255): the names come from `GET /api/accounts`.
    private func askAccountNamesIfNeeded() {
        guard
            let capture = LastPhrase.shownCapture(in: state, marks: marks),
            namedAccounts != capture.clientId,
            !askingAccounts,
            let reply = capture.reply,
            reply.records.contains(where: { $0.accountName == nil && $0.accountId != nil })
        else { return }
        askingAccounts = true
        let clientId = capture.clientId
        Task { [accounts] in
            let list = await accounts()
            askingAccounts = false
            guard let list else { return }
            accountNames = Dictionary(list.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
            namedAccounts = clientId
        }
    }
}
