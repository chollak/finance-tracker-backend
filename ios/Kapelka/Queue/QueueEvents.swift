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
    /// New since the last report and still waiting on the phone: the attempt ended «позже» (no network, the PC
    /// asleep, 429), or the pass did not reach them — the old record did not go, a 429 pause, no address. A later
    /// attempt that fails again is no news.
    case queued([Capture])
    /// The server refused the token, or a new phrase came while it is refused: nothing goes until the settings
    /// change.
    case tokenRefused
}

enum QueueEvents {
    /// The events between two reports of the queue (`CaptureQueue` reads them at the end of each pass), like
    /// `QueueStatus.wroteRecords`. Written and refused — the server's answers: a record whose attempts grew. Waiting —
    /// a record new since the last report. A payment refused on the phone, a record deleted or taken off are no news.
    static func between(_ old: QueueState, _ new: QueueState) -> [QueueEvent] {
        let earlier = Dictionary(old.captures.map { ($0.clientId, $0.attempts) }, uniquingKeysWith: { first, _ in first })
        var wrote: [Capture] = []
        var noOperation: [Capture] = []
        var rejected: [Capture] = []
        var waiting: [Capture] = []
        var triedAgain = false
        for capture in new.captures {
            let attemptsBefore = earlier[capture.clientId]
            let answered = capture.attempts > (attemptsBefore ?? 0)
            switch capture.state {
            case .sent where answered:
                switch capture.reply.flatMap(written(_:)) {
                case true?: wrote.append(capture)
                case false?: noOperation.append(capture)
                case nil: break
                }
            case .rejected where answered:
                rejected.append(capture)
            case .pending:
                if attemptsBefore == nil {
                    waiting.append(capture)
                } else if answered {
                    triedAgain = true
                }
            default:
                break
            }
        }
        // Refused now, or again after new settings, or a new phrase meets a refused token: an error, not «в очереди»
        let tokenRefused = new.tokenRefused && (!old.tokenRefused || triedAgain || !waiting.isEmpty)
        var events: [QueueEvent] = []
        if !wrote.isEmpty { events.append(.wrote(wrote)) }
        if !noOperation.isEmpty { events.append(.noOperation(noOperation)) }
        if !rejected.isEmpty { events.append(.rejected(rejected)) }
        if !waiting.isEmpty, !tokenRefused { events.append(.queued(waiting)) }
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
