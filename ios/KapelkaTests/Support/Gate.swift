import Foundation
import Testing

/// A door the test opens (#286): what waits at it goes on after `open()`, never on a timer. An answer «в пути» stays in
/// flight exactly as long as the test needs, however slow the machine is. A wait cancelled meanwhile ends with
/// `CancellationError`, as a cancelled request does, so a test that stops halfway does not hang on it.
final class Gate: @unchecked Sendable {
    /// Longer than any wait of a test that opens the gate. Past it the test stopped before `open()` — a `try` or a
    /// `#require` — or a call waits for the very answer the gate holds; the request may sit in a task of the app that
    /// nobody cancels, so the wait is let go with an issue: the run goes red instead of hanging (review of PR #339).
    static let giveUpAfter: Duration = .seconds(10)

    private let lock = NSLock()
    private var isOpen = false
    private var waiting: [UUID: CheckedContinuation<Void, any Error>] = [:]

    func wait() async throws {
        let id = UUID()
        // Never fires when the test opens the gate in time
        let failsafe = Task { [weak self] in
            try await Task.sleep(for: Self.giveUpAfter)
            guard let continuation = self?.leave(id) else { return }
            Issue.record("Gate: never opened — the test stopped before open(), or a call waits for this answer")
            continuation.resume(throwing: CancellationError())
        }
        defer { failsafe.cancel() }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                let now = admit(id, continuation)
                if let now {
                    continuation.resume(with: now)
                }
            }
        } onCancel: {
            leave(id)?.resume(throwing: CancellationError())
        }
    }

    /// Lets through every wait so far and every one after.
    func open() {
        let all = lock.withLock {
            isOpen = true
            let all = Array(waiting.values)
            waiting = [:]
            return all
        }
        all.forEach { $0.resume() }
    }

    /// How the wait ends at once — open already, or cancelled before it came; `nil` when it waits.
    private func admit(
        _ id: UUID,
        _ continuation: CheckedContinuation<Void, any Error>
    ) -> Result<Void, any Error>? {
        lock.withLock {
            if isOpen { return .success(()) }
            if Task.isCancelled { return .failure(CancellationError()) }
            waiting[id] = continuation
            return nil
        }
    }

    private func leave(_ id: UUID) -> CheckedContinuation<Void, any Error>? {
        lock.withLock { waiting.removeValue(forKey: id) }
    }
}
