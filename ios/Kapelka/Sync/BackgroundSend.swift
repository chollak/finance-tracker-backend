import Foundation
import os

/// `BGTaskScheduler` behind a seam for the tests.
protocol RefreshScheduling: Sendable {
    func submit(identifier: String, earliestBeginDate: Date) throws
    func cancel(identifier: String)
}

/// Sending from the background through `BGAppRefreshTask`. iOS picks the moment and promises none; this asks for one
/// while anything waits and stops asking when the queue is empty.
struct BackgroundSend: Sendable {
    /// Also in `BGTaskSchedulerPermittedIdentifiers` (`Config/Info.plist`).
    static let taskIdentifier = "kapelka.send-queue"
    /// The earliest moment to ask for; iOS usually comes later.
    static let earliestDelay: TimeInterval = 15 * 60

    private static let logger = Logger(subsystem: "kapelka", category: "background")

    let queue: CaptureQueue
    let scheduler: any RefreshScheduling
    var now: @Sendable () -> Date = { Date() }
    /// iOS gives a refresh about 30 s; one that runs out of it gets fewer refreshes later. A sleeping PC answers
    /// nothing until the 60 s timeout, so the pass stops on its own before that.
    var budget: Duration = .seconds(25)

    func schedule() async {
        let waiting = await queue.state().captures.contains { $0.state == .pending }
        guard waiting else {
            scheduler.cancel(identifier: Self.taskIdentifier)
            return
        }
        do {
            try scheduler.submit(identifier: Self.taskIdentifier, earliestBeginDate: now().addingTimeInterval(Self.earliestDelay))
        } catch {
            // The simulator has no background refresh and says so here
            Self.logger.error("Background refresh not scheduled: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The refresh itself. Out of time, iOS cancels the task: the pass stops and the record in flight stays pending.
    /// The call that waits for the queue is cancelled first, so it does not start the stopped run again.
    func run() async {
        let sending = Task { [queue] in await queue.flush() }
        let deadline = Task { [queue, budget] in
            try await Task.sleep(for: budget)
            sending.cancel()
            await queue.cancelSending()
        }
        await withTaskCancellationHandler {
            await sending.value
        } onCancel: { [queue] in
            sending.cancel()
            Task { await queue.cancelSending() }
        }
        deadline.cancel()
        await schedule()
    }
}
