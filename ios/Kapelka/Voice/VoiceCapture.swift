import Foundation
import Observation

/// Why listening could not start, as far as the screen needs to know.
enum ListeningError: Error {
    /// No microphone to open — none on the device, or the simulator, whose CoreAudio aborts the app on it.
    case noMicrophone
}

/// Listening to the microphone; the phrase so far comes as the whole text each time.
@MainActor
protocol SpeechListening: AnyObject {
    /// Starts the microphone; throws `ListeningError.noMicrophone` when there is none. The stream ends after
    /// `finish()` with the last words, or throws when recognition broke off or was cancelled.
    func start() throws -> AsyncThrowingStream<String, any Error>
    /// The phrase is complete: the last words come, then the stream ends.
    func finish()
    /// Stops at once; the stream throws.
    func cancel()
}

/// Voice input on the main screen (FT-178): it starts listening at once, ends the phrase on a pause of about 1.5 s or
/// a tap, and hands it to the queue. Recognition is Apple's, on the phone only — no sound leaves it (decision
/// 2026-10-29).
@MainActor
@Observable
final class VoiceCapture {
    enum Phase: Equatable {
        case idle
        /// Asking for permissions, starting the microphone.
        case starting
        case listening
        /// Tapped or paused: waiting for the last words.
        case finishing
        /// The phrase is being written to the phone; past cancelling.
        case saving
    }

    /// The pause after the last word that ends the phrase.
    nonisolated static let pause: Duration = .milliseconds(1500)
    /// Nothing said this long after the start: listening stops with «не расслышал».
    nonisolated static let silenceAtStart: Duration = .seconds(6)

    private(set) var phase: Phase = .idle
    /// What was heard; stays on the screen after the phrase went to the queue.
    private(set) var transcript = ""
    private(set) var problem: VoiceProblem?
    /// Grows with every problem shown, so the same one twice in a row still opens the keyboard again.
    private(set) var problemCount = 0

    private let system: any VoiceSystem
    private let listener: any SpeechListening
    private let pause: Duration
    private let silenceAtStart: Duration
    private let submit: @MainActor (String) async throws -> Void
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var cancelled = false

    init(
        system: any VoiceSystem,
        listener: any SpeechListening,
        pause: Duration = VoiceCapture.pause,
        silenceAtStart: Duration = VoiceCapture.silenceAtStart,
        submit: @escaping @MainActor (String) async throws -> Void
    ) {
        self.system = system
        self.listener = listener
        self.pause = pause
        self.silenceAtStart = silenceAtStart
        self.submit = submit
    }

    /// The microphone button: starts, ends the phrase, or stops a start that is still asking.
    func toggle() {
        switch phase {
        case .idle: start()
        case .starting: cancel()
        case .listening: finish()
        case .finishing, .saving: break
        }
    }

    func start() {
        guard phase == .idle else { return }
        phase = .starting
        transcript = ""
        problem = nil
        cancelled = false
        Task { await listen() }
    }

    /// Ends the phrase now, without waiting for the pause.
    func finish() {
        guard phase == .listening else { return }
        phase = .finishing
        timer?.cancel()
        listener.finish()
    }

    /// Stops without writing anything. A phrase already being written stays written.
    func cancel() {
        guard phase != .idle, phase != .saving, !cancelled else { return }
        cancelled = true
        timer?.cancel()
        if phase != .starting {
            listener.cancel()
        }
    }

    private func listen() async {
        if let problem = await VoiceAccess.check(system) {
            end(with: problem)
            return
        }
        guard !cancelled else {
            end(with: nil)
            return
        }
        let words: AsyncThrowingStream<String, any Error>
        do {
            words = try listener.start()
        } catch ListeningError.noMicrophone {
            end(with: .noMicrophone)
            return
        } catch {
            end(with: .failed)
            return
        }
        phase = .listening
        restartTimer(after: silenceAtStart)
        do {
            for try await text in words {
                transcript = text
                restartTimer(after: pause)
            }
        } catch {
            end(with: cancelled ? nil : .failed)
            return
        }
        timer?.cancel()
        let phrase = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cancelled else {
            end(with: nil)
            return
        }
        guard !phrase.isEmpty else {
            end(with: .nothingHeard)
            return
        }
        phase = .saving
        do {
            try await submit(phrase)
            end(with: nil)
        } catch {
            end(with: .notSaved)
        }
    }

    private func end(with problem: VoiceProblem?) {
        timer?.cancel()
        if cancelled {
            transcript = ""
        }
        self.problem = problem
        if problem != nil {
            problemCount += 1
        }
        phase = .idle
    }

    /// The silence that ends the phrase — or, before any word, the listening.
    private func restartTimer(after delay: Duration) {
        timer?.cancel()
        timer = Task { [weak self] in
            do {
                try await Task.sleep(for: delay)
            } catch {
                return
            }
            self?.finish()
        }
    }
}
