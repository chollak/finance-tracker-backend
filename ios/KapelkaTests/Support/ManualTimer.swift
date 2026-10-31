import Foundation

/// A wait that ends only when the test says so: the 5 s of «Вернуть» without waiting 5 s.
final class ManualTimer: @unchecked Sendable {
    private let lock = NSLock()
    private var waiting: [CheckedContinuation<Void, Never>] = []
    private var asked: [Duration] = []

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
}
