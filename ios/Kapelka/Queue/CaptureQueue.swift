import Foundation
import os

/// The phone's queue of phrases (FT-161, «Как устроено»). A record is written to disk before anything is sent and
/// leaves the pending ones only on the server's answer or when deleted while it waits. One sending run at a time, one record at a
/// time, oldest first, so two triggers at once cannot send a record twice; a record interrupted mid-request goes again
/// with the same `clientId`, which the server answers without writing a second one (FT-106).
actor CaptureQueue {
    /// Sent and refused records kept for the list on the main screen (FT-178). Pending ones are never dropped.
    static let keptFinished = 50

    private static let logger = Logger(subsystem: "kapelka", category: "queue")

    nonisolated let updates: AsyncStream<QueueState>

    private let store: CaptureFileStore
    private let sender: any CaptureSending
    private let now: @Sendable () -> Date
    private let timeZone: @Sendable () -> TimeZone
    private let waitForRetry: @Sendable (TimeInterval) async throws -> Void
    /// What each pass did (`QueueEvents.between`), when it did anything: the one entry of `AppServices` (FT-251).
    private let onPass: @Sendable ([QueueEvent]) async -> Void
    private let continuation: AsyncStream<QueueState>.Continuation
    private var current: QueueState
    /// `false` while the file could not be opened: then nothing is written over it (`QueueError.unavailable`).
    private var isLoaded: Bool
    /// Bumped on every settings change, so a 401 to a request sent with the old token does not stop the queue.
    private var settingsGeneration = 0
    /// The sending run: passes over the pending records until no trigger is left. `true` when `cancelSending()`
    /// stopped it.
    private var sending: Task<Bool, Never>?
    /// A trigger came while a run was going — a new network path, a new phrase. The pass may already be failing on
    /// the old path, so one more pass follows it.
    private var passRequested = false
    /// Sends again when a 429 pause is over, while the app runs.
    private var retryTimer: Task<Void, Never>?

    init(
        store: CaptureFileStore,
        sender: any CaptureSending,
        now: @escaping @Sendable () -> Date = { Date() },
        timeZone: @escaping @Sendable () -> TimeZone = { .current },
        waitForRetry: @escaping @Sendable (TimeInterval) async throws -> Void = { try await Task.sleep(for: .seconds($0)) },
        onPass: @escaping @Sendable ([QueueEvent]) async -> Void = { _ in }
    ) {
        self.store = store
        self.sender = sender
        self.now = now
        self.timeZone = timeZone
        self.waitForRetry = waitForRetry
        self.onPass = onPass
        let loaded = try? store.load()
        current = loaded ?? QueueState()
        isLoaded = loaded != nil
        let (stream, continuation) = AsyncStream.makeStream(of: QueueState.self, bufferingPolicy: .bufferingNewest(1))
        updates = stream
        self.continuation = continuation
        if let loaded {
            continuation.yield(loaded)
        }
    }

    func state() -> QueueState {
        _ = loadIfNeeded()
        return current
    }

    /// Writes the phrase to disk. Throws when the phrase is empty or too long, or the disk write failed — then the
    /// record does not exist and the screen must say so.
    @discardableResult
    func add(_ text: String) throws -> Capture {
        guard loadIfNeeded() else { throw QueueError.unavailable }
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

    /// Writes a payment from the Wallet automation to disk (FT-179). One that cannot be sent — another currency, no
    /// amount or one in a form not understood — is written all the same, already refused: the list shows it with the
    /// reason and nothing sends it.
    @discardableResult
    func addPayment(_ input: PaymentInput) throws -> Capture {
        guard loadIfNeeded() else { throw QueueError.unavailable }
        let (payment, problem) = Payment.from(input)
        var capture = Capture(
            clientId: UUID(),
            text: "",
            capturedAt: now(),
            timeZoneIdentifier: timeZone().identifier,
            payment: payment
        )
        if let problem {
            capture.state = .rejected
            capture.rejection = problem
        }
        var next = current
        next.captures.append(capture)
        next = Self.trimmed(next)
        try store.save(next)
        publish(next)
        return capture
    }

    /// Deletes a waiting record, so it is never sent; `false` when it does not wait any more. One whose request is
    /// out right now is not deleted: a timeout or a lost connection does not say whether the server wrote it, and the
    /// phone must not hide a record that may exist.
    func remove(_ clientId: UUID) throws -> Bool {
        guard loadIfNeeded() else { throw QueueError.unavailable }
        guard
            current.sendingId != clientId,
            let index = current.captures.firstIndex(where: { $0.clientId == clientId && $0.state == .pending })
        else { return false }
        var next = current
        next.captures.remove(at: index)
        try store.save(next)
        publish(next)
        return true
    }

    /// «Убрать» (FT-220): takes a record the server refused or found no operation in off the phone. Neither wrote
    /// anything on the server, so nothing is lost. `false` for any other record: a waiting one may still go, a written
    /// one is in «Записи».
    func dismiss(_ clientId: UUID) throws -> Bool {
        guard loadIfNeeded() else { throw QueueError.unavailable }
        guard let index = current.captures.firstIndex(where: { $0.clientId == clientId && Self.wroteNothing($0) }) else {
            return false
        }
        var next = current
        next.captures.remove(at: index)
        try store.save(next)
        publish(next)
        return true
    }

    private static func wroteNothing(_ capture: Capture) -> Bool {
        capture.state == .rejected || (capture.state == .sent && capture.reply?.status == "no_transaction")
    }

    /// Sends the pending records. A call while a run is going joins it and returns when the run is over — its trigger
    /// served by one more pass. A run stopped by `cancelSending()` is started again by every waiting call that is not
    /// cancelled itself, so a stop meant for the background refresh does not cost the open app its send. A caller
    /// already cancelled (a background refresh out of time) starts nothing.
    func flush() async {
        while !Task.isCancelled {
            let run: Task<Bool, Never>
            if let sending {
                passRequested = true
                run = sending
            } else {
                guard loadIfNeeded() else { return }
                run = Task { await sendWhileRequested() }
                sending = run
            }
            guard await run.value else { return }
        }
    }

    /// Stops the running pass, for a background refresh that is out of time: it cancels its own call first, then this.
    /// The record in flight stays pending; callers that still wait start the run again.
    func cancelSending() {
        sending?.cancel()
    }

    /// The address or the token changed: try again after a refused token.
    func settingsChanged() {
        settingsGeneration += 1
        guard loadIfNeeded(), current.tokenRefused else { return }
        var next = current
        next.tokenRefused = false
        persist(next)
    }

    /// `true` when stopped by `cancelSending()`.
    private func sendWhileRequested() async -> Bool {
        repeat {
            passRequested = false
            await sendPending()
        } while passRequested && !Task.isCancelled
        // On the actor right after the last check for triggers, so a later call starts a new run
        sending = nil
        scheduleRetry()
        return Task.isCancelled
    }

    /// One pass, and one report on it however many records it sent. The report is awaited: a background refresh or
    /// a command ends only after the notices of what it sent (FT-253). The pass may already be cancelled by then — the
    /// records it wrote are news all the same.
    private func sendPending() async {
        let before = current
        await sendEach()
        let events = QueueEvents.between(before, current)
        if !events.isEmpty {
            await onPass(events)
        }
    }

    private func sendEach() async {
        while !Task.isCancelled, let capture = nextToSend() {
            let generation = settingsGeneration
            markSending(capture.clientId)
            let outcome = await sender.send(capture)
            markSending(nil)
            // Cut short by `cancelSending()`: not the server's answer, so not an attempt
            if Task.isCancelled, case .retryLater = outcome { break }
            // Refused with the settings of before: the next round goes with the new ones
            if outcome == .tokenRefused, generation != settingsGeneration { continue }
            guard apply(outcome, to: capture.clientId) else { break }
        }
    }

    private func markSending(_ clientId: UUID?) {
        var next = current
        next.sendingId = clientId
        publish(next)
    }

    /// After 429 the queue waits for `notBefore`. The app open, it sends then by itself, without a new trigger.
    private func scheduleRetry() {
        retryTimer?.cancel()
        retryTimer = nil
        guard
            let notBefore = current.notBefore, !current.tokenRefused,
            current.captures.contains(where: { $0.state == .pending })
        else { return }
        let delay = notBefore.timeIntervalSince(now())
        guard delay > 0 else { return }
        retryTimer = Task { [waitForRetry] in
            do {
                try await waitForRetry(delay)
            } catch {
                return
            }
            // Replaced while waking up: the newer timer is the one to keep
            guard !Task.isCancelled else { return }
            await retryDue()
        }
    }

    private func retryDue() async {
        retryTimer = nil
        await flush()
    }

    /// Reads the file once it can be opened. Until then the queue neither takes records nor sends.
    private func loadIfNeeded() -> Bool {
        guard !isLoaded else { return true }
        do {
            let loaded = try store.load()
            isLoaded = true
            publish(loaded)
            return true
        } catch {
            Self.logger.error("Queue file not readable yet: \(error.localizedDescription, privacy: .public)")
            return false
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
