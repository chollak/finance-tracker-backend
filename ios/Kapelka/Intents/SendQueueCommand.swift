import Foundation

/// «Отправить очередь» without App Intents around it: sends within the time iOS gives a command and answers with its
/// dialog, so what it sends posts no notification (FT-253). Each run, step by step, goes to the journal (#241).
struct SendQueueCommand: Sendable {
    let queue: CaptureQueue
    /// `BackgroundSend.run()` inside `FeedbackEntry.quietly`.
    let send: @Sendable () async -> Void
    let isConfigured: @Sendable () -> Bool
    let journal: CommandJournal

    /// The dialog's text: «Всё отправлено», «В очереди: N …» or what the settings lack.
    func run() async -> String {
        let run = await journal.begin(.sendQueue)
        let before = await queue.state()
        await journal.step(run, JournalText.pending(QueueStatus.pendingCount(before)))
        await send()
        let after = await queue.state()
        let configured = isConfigured()
        await journal.step(run, JournalText.queueSent(before: before, after: after, configured: configured))
        let report = QueueStatus.afterSending(after, configured: configured)
        await journal.step(run, JournalText.dialog(report))
        await journal.finish(run)
        return report
    }
}
