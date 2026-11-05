import Foundation

/// A wait that ends only when the test says so: the 5 s of «Вернуть» without waiting 5 s.
final class ManualTimer: @unchecked Sendable {
    private let lock = NSLock()
    private var waiting: [CheckedContinuation<Void, Never>] = []
    private var asked: [Duration] = []
    private var returnedCount = 0

    deinit {
        // A wait left over ends with the test: a continuation must not be dropped unresumed
        waiting.forEach { $0.resume() }
    }

    /// For `RecordsList(wait:)`.
    func wait(_ duration: Duration) async {
        await withCheckedContinuation { continuation in
            lock.withLock {
                asked.append(duration)
                waiting.append(continuation)
            }
        }
    }

    /// `wait:` of a caller on the main actor — `RecordsList` and its bar (#286). The wait ends on the main actor and
    /// is counted there right before the caller goes on, in the same turn of the main actor: once `returned` counts
    /// it, the caller's step after the wait has run, and a check that it changed nothing needs no sleep.
    var onMain: @Sendable (Duration) async -> Void {
        { @MainActor [self] duration in
            await wait(duration)
            markReturned()
        }
    }

    /// The waits of `onMain` that ended and went back to their caller.
    var returned: Int { lock.withLock { returnedCount } }

    /// The waits asked for so far, the ended ones too.
    var durations: [Duration] { lock.withLock { asked } }

    /// Ends the wait started first of those still running.
    func fireOldest() {
        let ended = lock.withLock { waiting.isEmpty ? nil : waiting.removeFirst() }
        ended?.resume()
    }

    /// Ends every wait started so far.
    func fire() {
        let ended = lock.withLock {
            let all = waiting
            waiting = []
            return all
        }
        ended.forEach { $0.resume() }
    }

    private func markReturned() {
        lock.withLock { returnedCount += 1 }
    }
}
