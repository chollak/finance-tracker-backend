import Foundation

/// What one pass of the queue did (FT-251). One event per kind, however many records the pass sent: three phrases
/// written are one «записал» — one haptic on screen, one notice in the background (FT-253). Each event carries its
/// records, so a notice can name them.
enum QueueEvent: Equatable, Sendable {
    /// The server wrote these: each has a record not deleted on the server, or — an answer without records, from a
    /// server before FT-255 — a status that says so.
    case wrote([Capture])
    /// The server found no operation in these phrases (`no_transaction`): nothing was written.
    case noOperation([Capture])
    /// The server refused these (400): they are not sent again.
    case rejected([Capture])
    /// Their first attempt ended «позже» — no network, the PC asleep, 429 — and they wait on the phone. An attempt
    /// after it that fails again is no news.
    case queued([Capture])
    /// The server refused the token: nothing goes until the settings change.
    case tokenRefused
}

enum QueueEvents {
    /// The events between two states of the queue, like `QueueStatus.wroteRecords`: the queue reads them before and
    /// after each pass. Only the server's answers count — a record whose attempts grew in between; a phrase just
    /// added, a payment refused on the phone, a record deleted or taken off are no news.
    static func between(_ old: QueueState, _ new: QueueState) -> [QueueEvent] {
        let earlier = Dictionary(old.captures.map { ($0.clientId, $0.attempts) }, uniquingKeysWith: { first, _ in first })
        let tokenRefused = new.tokenRefused && !old.tokenRefused
        var wrote: [Capture] = []
        var noOperation: [Capture] = []
        var rejected: [Capture] = []
        var queued: [Capture] = []
        for capture in new.captures {
            let attemptsBefore = earlier[capture.clientId] ?? 0
            guard capture.attempts > attemptsBefore else { continue }
            switch capture.state {
            case .sent:
                switch capture.reply.flatMap(written(_:)) {
                case true?: wrote.append(capture)
                case false?: noOperation.append(capture)
                case nil: break
                }
            case .rejected:
                rejected.append(capture)
            case .pending:
                // A refused token says it all: nothing goes until new settings
                if !tokenRefused, attemptsBefore == 0 {
                    queued.append(capture)
                }
            }
        }
        var events: [QueueEvent] = []
        if !wrote.isEmpty { events.append(.wrote(wrote)) }
        if !noOperation.isEmpty { events.append(.noOperation(noOperation)) }
        if !rejected.isEmpty { events.append(.rejected(rejected)) }
        if !queued.isEmpty { events.append(.queued(queued)) }
        if tokenRefused { events.append(.tokenRefused) }
        return events
    }

    /// «Записал, проверь»: a written record the server is unsure of. Decided by the records, not by `repeated` — a
    /// repeat during the first write comes with the whole answer; the status counts only when there are no records.
    static func needsReview(_ capture: Capture) -> Bool {
        guard let reply = capture.reply else { return false }
        let live = reply.liveRecords
        return live.isEmpty ? reply.status == "needs_review" : live.contains(where: \.needsReview)
    }

    /// `true` — written, `false` — no operation, `nil` — every record was deleted on the server before this answer
    /// came (a repeat after a lost answer, FT-255): neither news.
    private static func written(_ reply: CaptureReply) -> Bool? {
        if !reply.liveRecords.isEmpty { return true }
        guard reply.records.isEmpty else { return nil }
        // A debt alone is `needs_review` without records; a server before FT-255 sends the status alone
        return reply.status != "no_transaction"
    }
}

extension CaptureReply {
    /// The records still on the server. A repeat after a deletion keeps the deleted one with `deletedAt` (FT-255);
    /// it is not counted as written.
    var liveRecords: [CapturedRecord] {
        records.filter { !$0.isDeleted }
    }
}
