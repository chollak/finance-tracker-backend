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
    func run() async {
        await withTaskCancellationHandler {
            await queue.flush()
        } onCancel: { [queue] in
            Task { await queue.cancelSending() }
        }
        await schedule()
    }
}
