import Foundation
import os

/// The phone's queue of phrases (FT-161, «Как устроено»). A record is written to disk before anything is sent and
/// leaves the pending ones only on the server's answer or when deleted. One sending run at a time, one record at a
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
    private let continuation: AsyncStream<QueueState>.Continuation
    private var current: QueueState
    /// `false` while the file could not be opened: then nothing is written over it (`QueueError.unavailable`).
    private var isLoaded: Bool
    /// Bumped on every settings change, so a 401 to a request sent with the old token does not stop the queue.
    private var settingsGeneration = 0
    /// The sending run: passes over the pending records until no trigger is left.
    private var sending: Task<Void, Never>?
    /// A trigger came while a run was going — a new network path, a new phrase. The pass may already be failing on
    /// the old path, so one more pass follows it.
    private var passRequested = false
    /// The record whose request is out now.
    private var inFlight: UUID?
    /// That record, deleted while its request was out.
    private var deletedInFlight: Capture?
    /// Sends again when a 429 pause is over, while the app runs.
    private var retryTimer: Task<Void, Never>?

    init(
        store: CaptureFileStore,
        sender: any CaptureSending,
        now: @escaping @Sendable () -> Date = { Date() },
        timeZone: @escaping @Sendable () -> TimeZone = { .current },
        waitForRetry: @escaping @Sendable (TimeInterval) async throws -> Void = { try await Task.sleep(for: .seconds($0)) }
    ) {
        self.store = store
        self.sender = sender
        self.now = now
        self.timeZone = timeZone
        self.waitForRetry = waitForRetry
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

    /// Deletes a pending record, so it is never sent; `false` when it is not pending any more. One whose request is
    /// out right now leaves the list at once; if the server still writes it, it comes back as sent — the phone must not
    /// hide a record that exists.
    func remove(_ clientId: UUID) throws -> Bool {
        guard loadIfNeeded() else { throw QueueError.unavailable }
        guard let index = current.captures.firstIndex(where: { $0.clientId == clientId && $0.state == .pending }) else {
            return false
        }
        var next = current
        let removed = next.captures.remove(at: index)
        try store.save(next)
        if inFlight == clientId {
            deletedInFlight = removed
        }
        publish(next)
        return true
    }

    /// Sends the pending records. A call while a run is going joins it and returns when the run is over — its trigger
    /// served by one more pass. A run stopped by `cancelSending()` before that pass is started again by a caller that is
    /// not cancelled itself; a caller already cancelled (a background refresh out of time) starts nothing.
    func flush() async {
        while !Task.isCancelled {
            if let sending {
                passRequested = true
                await sending.value
                // Still set: the run was stopped before the pass this call asked for
                guard passRequested else { return }
                continue
            }
            guard loadIfNeeded() else { return }
            let run = Task { await sendWhileRequested() }
            sending = run
            await run.value
            return
        }
    }

    /// Stops the running pass, for a background refresh that is out of time. The record in flight stays pending.
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

    private func sendWhileRequested() async {
        repeat {
            passRequested = false
            await sendPending()
        } while passRequested && !Task.isCancelled
        // On the actor right after the last check for triggers, so a later call starts a new run
        sending = nil
        scheduleRetry()
    }

    private func sendPending() async {
        while !Task.isCancelled, let capture = nextToSend() {
            let generation = settingsGeneration
            inFlight = capture.clientId
            let outcome = await sender.send(capture)
            inFlight = nil
            // Cut short by `cancelSending()`: not the server's answer, so not an attempt
            if Task.isCancelled, case .retryLater = outcome {
                deletedInFlight = nil
                break
            }
            // Refused with the settings of before: the next round goes with the new ones
            if outcome == .tokenRefused, generation != settingsGeneration {
                deletedInFlight = nil
                continue
            }
            guard apply(outcome, to: capture) else { break }
        }
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
    private func apply(_ outcome: SendOutcome, to sent: Capture) -> Bool {
        var next = current
        let index = next.captures.firstIndex { $0.clientId == sent.clientId }
        // Deleted while its request was out: only a record the server wrote comes back
        var capture = index.map { next.captures[$0] } ?? deletedInFlight ?? sent
        deletedInFlight = nil
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
        if let index {
            next.captures[index] = capture
        } else if capture.state == .sent {
            let position = next.captures.firstIndex { $0.capturedAt > capture.capturedAt } ?? next.captures.endIndex
            next.captures.insert(capture, at: position)
        }
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
