import Foundation
@testable import Kapelka

/// The phone's permissions and Apple's recognizer, played by the test: it decides what iOS answers and what is heard.
@MainActor
final class FakeSpeech: VoiceSystem, SpeechListening {
    var microphoneState: Permission = .granted
    var recognitionState: Permission = .granted
    /// What the person taps in the iOS dialog.
    var answer: Permission = .granted
    var russianState: RussianRecognition = .ready
    var startFails = false
    /// The iOS dialog stays up until `answerDialog()`.
    var holdsDialog = false
    private var dialog: CheckedContinuation<Void, Never>?
    /// What `start()` throws when it fails; by default a broken audio start.
    var startError: any Error = URLError(.unknown)

    private(set) var microphoneRequests = 0
    private(set) var recognitionRequests = 0
    private(set) var starts = 0
    private(set) var finishes = 0
    private(set) var cancels = 0
    private var continuation: AsyncThrowingStream<String, any Error>.Continuation?

    var isListening: Bool { continuation != nil }

    func microphone() -> Permission { microphoneState }

    func requestMicrophone() async -> Permission {
        microphoneRequests += 1
        if holdsDialog {
            await withCheckedContinuation { dialog = $0 }
        }
        microphoneState = answer
        return answer
    }

    func recognition() -> Permission { recognitionState }

    func requestRecognition() async -> Permission {
        recognitionRequests += 1
        recognitionState = answer
        return answer
    }

    func russian() -> RussianRecognition { russianState }

    func start() throws -> AsyncThrowingStream<String, any Error> {
        starts += 1
        if startFails { throw startError }
        let (words, continuation) = AsyncThrowingStream.makeStream(of: String.self)
        self.continuation = continuation
        return words
    }

    func finish() {
        finishes += 1
        end()
    }

    func cancel() {
        cancels += 1
        end(throwing: CancellationError())
    }

    func answerDialog() {
        dialog?.resume()
        dialog = nil
    }

    /// The whole phrase heard so far, as Apple reports it.
    func hear(_ phrase: String) {
        continuation?.yield(phrase)
    }

    /// Recognition broke off: an interruption, a call.
    func fail() {
        end(throwing: URLError(.unknown))
    }

    private func end(throwing error: (any Error)? = nil) {
        continuation?.finish(throwing: error)
        continuation = nil
    }
}
