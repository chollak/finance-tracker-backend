import Foundation
import os

/// The phone's queue of phrases (FT-161, «Как устроено»). A record is written to disk before anything is sent and
/// leaves the pending ones only on the server's answer. One sending pass at a time, one record at a time, oldest
/// first, so two triggers at once cannot send a record twice; a record interrupted mid-request goes again with the
/// same `clientId`, which the server answers without writing a second one (FT-106).
actor CaptureQueue {
    /// Sent and refused records kept for the list on the main screen (FT-178). Pending ones are never dropped.
    static let keptFinished = 50

    private static let logger = Logger(subsystem: "kapelka", category: "queue")

    nonisolated let updates: AsyncStream<QueueState>

    private let store: CaptureFileStore
    private let sender: any CaptureSending
    private let now: @Sendable () -> Date
    private let timeZone: @Sendable () -> TimeZone
    private let continuation: AsyncStream<QueueState>.Continuation
    private var current: QueueState
    private var sending: Task<Void, Never>?

    init(
        store: CaptureFileStore,
        sender: any CaptureSending,
        now: @escaping @Sendable () -> Date = { Date() },
        timeZone: @escaping @Sendable () -> TimeZone = { .current }
    ) {
        self.store = store
        self.sender = sender
        self.now = now
        self.timeZone = timeZone
        let loaded = store.load()
        current = loaded
        let (stream, continuation) = AsyncStream.makeStream(of: QueueState.self, bufferingPolicy: .bufferingNewest(1))
        updates = stream
        self.continuation = continuation
        continuation.yield(loaded)
    }

    func state() -> QueueState {
        current
    }

    /// Writes the phrase to disk. Throws when the phrase is empty or too long, or the disk write failed — then the
    /// record does not exist and the screen must say so.
    @discardableResult
    func add(_ text: String) throws -> Capture {
        let capture = Capture(
            clientId: UUID(),
            text: try CaptureText.validated(text),
            capturedAt: now(),
            timeZoneIdentifier: timeZone().identifier
        )
        var next = current
        next.captures.append(capture)
        try store.save(next)
        publish(next)
        return capture
    }

    /// Sends the pending records. A call while a pass is running waits for that pass instead of starting another.
    func flush() async {
        if let sending {
            await sending.value
            return
        }
        let pass = Task { await sendPending() }
        sending = pass
        await pass.value
    }

    /// Stops the running pass, for a background refresh that is out of time. The record in flight stays pending.
    func cancelSending() {
        sending?.cancel()
    }

    /// The address or the token changed: try again after a refused token.
    func settingsChanged() {
        guard current.tokenRefused else { return }
        var next = current
        next.tokenRefused = false
        persist(next)
    }

    private func sendPending() async {
        // Runs on the actor right after the last check for work, so a record added later starts a new pass
        defer { sending = nil }
        while !Task.isCancelled, let capture = nextToSend() {
            let outcome = await sender.send(capture)
            // Cut short by `cancelSending()`: not the server's answer, so not an attempt
            if Task.isCancelled, case .retryLater = outcome { break }
            guard apply(outcome, to: capture.clientId) else { break }
        }
    }

    private func nextToSend() -> Capture? {
        guard !current.tokenRefused else { return nil }
        if let notBefore = current.notBefore, notBefore > now() { return nil }
        return current.captures.first { $0.state == .pending }
    }

    /// Records the outcome; `true` when the pass may go on with the next record.
    private func apply(_ outcome: SendOutcome, to clientId: UUID) -> Bool {
        guard let index = current.captures.firstIndex(where: { $0.clientId == clientId }) else { return true }
        var next = current
        var capture = next.captures[index]
        let goOn: Bool
        switch outcome {
        case .notConfigured:
            // Nothing was sent: no attempt, nothing to save
            return false
        case let .sent(reply):
            capture.attempts += 1
            capture.state = .sent
            capture.reply = reply
            next.notBefore = nil
            goOn = true
        case let .rejected(message):
            capture.attempts += 1
            capture.state = .rejected
            capture.rejection = message
            goOn = true
        case let .retryLater(after):
            capture.attempts += 1
            next.notBefore = after.map { now().addingTimeInterval($0) }
            goOn = false
        case .tokenRefused:
            capture.attempts += 1
            next.tokenRefused = true
            goOn = false
        }
        next.captures[index] = capture
        persist(Self.trimmed(next))
        return goOn
    }

    private static func trimmed(_ state: QueueState) -> QueueState {
        let finished = state.captures.filter { $0.state != .pending }
        guard finished.count > keptFinished else { return state }
        let dropped = Set(finished.prefix(finished.count - keptFinished).map(\.clientId))
        var next = state
        next.captures.removeAll { dropped.contains($0.clientId) }
        return next
    }

    /// A failed write keeps the new state in memory: the worst case is a record sent once more after a restart,
    /// with the same `clientId`.
    private func persist(_ next: QueueState) {
        do {
            try store.save(next)
        } catch {
            Self.logger.error("Queue not saved: \(error.localizedDescription, privacy: .public)")
        }
        publish(next)
    }

    private func publish(_ next: QueueState) {
        current = next
        continuation.yield(next)
    }
}
