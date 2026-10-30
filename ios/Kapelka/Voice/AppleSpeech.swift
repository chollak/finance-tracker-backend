import AVFAudio
import Speech
import os

/// Apple's recognition of Russian on the phone itself (`requiresOnDeviceRecognition`): the same with a network and
/// without, and the sound never leaves the phone. Needs the Russian dictation downloaded; without it
/// `russian()` says `networkOnly` and the screen asks to download it.
@MainActor
final class AppleSpeech: VoiceSystem, SpeechListening {
    private static let logger = Logger(subsystem: "kapelka", category: "voice")
    /// After the tap the last words come at once; this long without them, the phrase ends as it was heard.
    private static let lastWordsWait: Duration = .seconds(2)

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ru-RU"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var continuation: AsyncThrowingStream<String, any Error>.Continuation?
    /// Tells a late callback of an earlier phrase from the current one.
    private var session = 0
    private var isFinishing = false
    /// The input node is opened only once a microphone is known to be there.
    private var hasTap = false

    func microphone() -> Permission {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: .granted
        case .denied: .denied
        default: .notAsked
        }
    }

    func requestMicrophone() async -> Permission {
        await AVAudioApplication.requestRecordPermission() ? .granted : .denied
    }

    func recognition() -> Permission {
        Self.permission(SFSpeechRecognizer.authorizationStatus())
    }

    func requestRecognition() async -> Permission {
        Self.permission(await Self.requestRecognitionStatus())
    }

    func russian() -> RussianRecognition {
        guard let recognizer else { return .missing }
        guard recognizer.supportsOnDeviceRecognition else { return .networkOnly }
        return recognizer.isAvailable ? .ready : .unavailable
    }

    func start() throws -> AsyncThrowingStream<String, any Error> {
        #if targetEnvironment(simulator)
        // The simulator's audio input aborts the app inside CoreAudio when the input node is first touched
        // (`AURemoteIO::Initialize`, «RPC timeout… Apparently deadlocked»), and an abort cannot be caught.
        // Voice is checked on the iPhone.
        throw ListeningError.noMicrophone
        #else
        guard let recognizer else { throw SpeechStartError.noRecognizer }
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audio.setActive(true, options: .notifyOthersOnDeactivation)
        // Asked of the session before the engine opens its input node, which has no way to fail softly
        guard audio.isInputAvailable, audio.inputNumberOfChannels > 0, audio.sampleRate > 0 else {
            try? audio.setActive(false, options: .notifyOthersOnDeactivation)
            throw ListeningError.noMicrophone
        }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else {
            stopAudio()
            throw ListeningError.noMicrophone
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: Self.feeding(request))
        hasTap = true
        engine.prepare()
        do {
            try engine.start()
        } catch {
            stopAudio()
            throw error
        }

        session += 1
        isFinishing = false
        let (words, continuation) = AsyncThrowingStream.makeStream(of: String.self)
        self.continuation = continuation
        self.request = request
        task = recognizer.recognitionTask(
            with: request,
            resultHandler: Self.reporting(to: continuation, owner: self, session: session)
        )
        return words
        #endif
    }

    func finish() {
        guard let request, !isFinishing else { return }
        isFinishing = true
        stopAudio()
        request.endAudio()
        let finishing = session
        Task { [weak self] in
            try? await Task.sleep(for: Self.lastWordsWait)
            self?.ended(session: finishing, failed: false)
        }
    }

    func cancel() {
        task?.cancel()
        stopAudio()
        continuation?.finish(throwing: CancellationError())
        clear()
    }

    /// The end of a phrase: the last words came, recognition failed, or the wait after the tap ran out.
    private func ended(session: Int, failed: Bool) {
        guard session == self.session, let continuation else { return }
        task?.cancel()
        stopAudio()
        // After the tap an error is iOS saying it heard nothing more: the phrase ends as it is
        if failed && !isFinishing {
            Self.logger.error("Recognition broke off")
            continuation.finish(throwing: SpeechStartError.brokeOff)
        } else {
            continuation.finish()
        }
        clear()
    }

    private func stopAudio() {
        if engine.isRunning {
            engine.stop()
        }
        if hasTap {
            engine.inputNode.removeTap(onBus: 0)
            hasTap = false
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func clear() {
        continuation = nil
        request = nil
        task = nil
    }

    private static func permission(_ status: SFSpeechRecognizerAuthorizationStatus) -> Permission {
        switch status {
        case .authorized: .granted
        case .notDetermined: .notAsked
        default: .denied
        }
    }

    // The callbacks below run off the main thread. Made outside the main actor, they carry no main-actor check that
    // would stop the app there.

    nonisolated private static func requestRecognitionStatus() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
    }

    nonisolated private static func feeding(_ request: SFSpeechAudioBufferRecognitionRequest) -> AVAudioNodeTapBlock {
        { buffer, _ in request.append(buffer) }
    }

    nonisolated private static func reporting(
        to continuation: AsyncThrowingStream<String, any Error>.Continuation,
        owner: AppleSpeech,
        session: Int
    ) -> (SFSpeechRecognitionResult?, (any Error)?) -> Void {
        { [weak owner] result, error in
            if let result {
                continuation.yield(result.bestTranscription.formattedString)
            }
            let isFinal = result?.isFinal ?? false
            guard isFinal || error != nil else { return }
            let failed = !isFinal
            Task { @MainActor in owner?.ended(session: session, failed: failed) }
        }
    }
}

enum SpeechStartError: Error {
    case noRecognizer
    case brokeOff
}
