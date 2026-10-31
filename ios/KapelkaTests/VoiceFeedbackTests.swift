import Foundation
import Testing
@testable import Kapelka

/// What the voice told the entry, in order.
@MainActor
final class FeedbackLog {
    private(set) var events: [FeedbackEvent] = []

    func add(_ event: FeedbackEvent) {
        events.append(event)
    }
}

/// The microphone's part of the haptics (FT-251): the start of listening is felt, and so is a `VoiceProblem`.
@MainActor
@Suite("Голос: отклик")
struct VoiceFeedbackTests {
    private func makeVoice(
        _ speech: FakeSpeech,
        _ log: FeedbackLog,
        silenceAtStart: Duration = .seconds(5),
        submit: @escaping @MainActor (String) async throws -> Void = { _ in }
    ) -> VoiceCapture {
        VoiceCapture(
            system: speech,
            listener: speech,
            pause: .milliseconds(150),
            silenceAtStart: silenceAtStart,
            feedback: log.add,
            submit: submit
        )
    }

    @Test("микрофон начал слушать — «слушаю», один раз; фраза записана — больше ничего от голоса")
    func listeningOnce() async throws {
        let speech = FakeSpeech()
        let log = FeedbackLog()
        let voice = makeVoice(speech, log)

        voice.start()
        #expect(await eventually { await speech.isListening })
        #expect(log.events == [.listening])
        speech.hear("кофе 25 тысяч")

        #expect(await eventually { await voice.phase == .idle })
        // «Записал» — от очереди, когда сервер ответит
        #expect(log.events == [.listening])
    }

    @Test("не расслышал — «слушаю», потом ошибка")
    func nothingHeard() async {
        let speech = FakeSpeech()
        let log = FeedbackLog()
        let voice = makeVoice(speech, log, silenceAtStart: .milliseconds(50))

        voice.start()

        #expect(await eventually { await voice.problem == .nothingHeard })
        #expect(log.events == [.listening, .voiceFailed])
    }

    @Test("нет доступа к микрофону — ошибка, «слушаю» не было")
    func microphoneDenied() async {
        let speech = FakeSpeech()
        speech.microphoneState = .denied
        let log = FeedbackLog()
        let voice = makeVoice(speech, log)

        voice.start()

        #expect(await eventually { await voice.problem == .microphoneDenied })
        #expect(log.events == [.voiceFailed])
    }

    @Test("не сохранилось на телефоне — ошибка")
    func notSaved() async {
        let speech = FakeSpeech()
        let log = FeedbackLog()
        let voice = makeVoice(speech, log) { _ in throw QueueError.unavailable }

        voice.start()
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 25 тысяч")

        #expect(await eventually { await voice.problem == .notSaved })
        #expect(log.events == [.listening, .voiceFailed])
    }

    @Test("отмена — без ошибки")
    func cancelIsSilent() async {
        let speech = FakeSpeech()
        let log = FeedbackLog()
        let voice = makeVoice(speech, log)

        voice.start()
        #expect(await eventually { await speech.isListening })
        voice.cancel()

        #expect(await eventually { await voice.phase == .idle })
        #expect(log.events == [.listening])
    }
}
