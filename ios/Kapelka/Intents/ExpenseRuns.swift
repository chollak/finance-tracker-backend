import Foundation

/// «Записать трату» in the journal (#241). The command only opens the app and asks it to listen (`ListenRequest`): the
/// phrase is the screen's. So its run goes on here — the press taken, the phrase on the phone, its send — and ends
/// when the microphone is done. An app killed while it listens or sends leaves the run «оборвана» with its last step.
/// A phrase from the microphone button, with no press behind it, writes nothing to the journal.
@MainActor
final class ExpenseRuns {
    private let journal: CommandJournal
    private let queue: CaptureQueue
    private let isConfigured: @Sendable () -> Bool
    /// The runs whose phrase the microphone is taking now.
    private var listening: [UUID] = []
    /// The journal's lines one after another, in the order they happened here.
    private var writing: Task<Void, Never>?

    init(journal: CommandJournal, queue: CaptureQueue, isConfigured: @escaping @Sendable () -> Bool) {
        self.journal = journal
        self.queue = queue
        self.isConfigured = isConfigured
    }

    /// The screen took the presses: the first one listens, one while listening ends the phrase. Called before the
    /// microphone hears anything, so the phrase finds its runs.
    func pressed(_ runs: [UUID], phase: VoiceCapture.Phase) {
        guard !runs.isEmpty else { return }
        listening += runs
        let text = JournalText.pressed(phase)
        log { journal in
            for run in runs {
                await journal.step(run, text)
            }
        }
    }

    /// The microphone's phrase: on the phone, then sent without waiting for it — as before the journal.
    func write(_ phrase: String) async throws {
        let capture: Capture
        do {
            capture = try await queue.add(phrase)
        } catch {
            let runs = takeListening()
            let message = error.localizedDescription
            log { journal in
                for run in runs {
                    await journal.fail(run, message)
                }
            }
            throw error
        }
        let runs = takeListening()
        log { journal in
            for run in runs {
                await journal.step(run, JournalText.queued(capture))
            }
        }
        Task { [queue, isConfigured] in
            await queue.flush()
            guard !runs.isEmpty else { return }
            let sent = JournalText.sent(capture.clientId, await queue.state(), configured: isConfigured())
            log { journal in
                for run in runs {
                    await journal.step(run, sent)
                    await journal.finish(run)
                }
            }
        }
    }

    /// The microphone is done (`VoiceCapture`'s `ended`). Runs still waiting got no phrase: cancelled, nothing heard,
    /// no microphone.
    func voiceEnded(_ problem: VoiceProblem?) {
        let runs = takeListening()
        guard !runs.isEmpty else { return }
        let text = JournalText.noPhrase(problem)
        log { journal in
            for run in runs {
                await journal.step(run, text)
                await journal.finish(run)
            }
        }
    }

    private func takeListening() -> [UUID] {
        defer { listening = [] }
        return listening
    }

    private func log(_ work: @escaping @Sendable (CommandJournal) async -> Void) {
        let previous = writing
        writing = Task { [journal] in
            await previous?.value
            await work(journal)
        }
    }
}
