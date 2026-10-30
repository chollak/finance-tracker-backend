import Foundation
import Testing
@testable import Kapelka

/// Phrases the voice handed over, in order.
@MainActor
final class Phrases {
    private(set) var all: [String] = []

    func add(_ phrase: String) {
        all.append(phrase)
    }
}

@MainActor
@Suite("Голос")
struct VoiceCaptureTests {
    private func makeVoice(
        _ speech: FakeSpeech,
        pause: Duration = .milliseconds(150),
        silenceAtStart: Duration = .seconds(5),
        submit: @escaping @MainActor (String) async throws -> Void = { _ in }
    ) -> VoiceCapture {
        VoiceCapture(system: speech, listener: speech, pause: pause, silenceAtStart: silenceAtStart, submit: submit)
    }

    @Test("пауза после слов — фраза ложится в очередь, без нажатий")
    func pauseEndsPhrase() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let queue = harness.makeQueue()
        let speech = FakeSpeech()
        let voice = makeVoice(speech) { try await queue.add($0) }

        voice.start()
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе")
        speech.hear("кофе 25 тысяч")

        #expect(try await eventually { try harness.store.load().captures.map(\.text) == ["кофе 25 тысяч"] })
        #expect(speech.finishes == 1)
        #expect(voice.phase == .idle)
        #expect(voice.problem == nil)
    }

    @Test("пока говорят, фраза не уходит: пауза считается от последних слов")
    func pauseCountsFromLastWords() async throws {
        let speech = FakeSpeech()
        let phrases = Phrases()
        let voice = makeVoice(speech, pause: .milliseconds(300), submit: phrases.add)

        voice.start()
        #expect(await eventually { await speech.isListening })
        for words in ["обед", "обед 60", "обед 60 тысяч"] {
            speech.hear(words)
            try await Task.sleep(for: .milliseconds(150))
        }
        #expect(phrases.all.isEmpty)

        #expect(await eventually { await phrases.all == ["обед 60 тысяч"] })
    }

    @Test("нажатие заканчивает фразу сразу, не дожидаясь паузы")
    func tapEndsPhrase() async throws {
        let speech = FakeSpeech()
        let phrases = Phrases()
        let voice = makeVoice(speech, pause: .seconds(30), submit: phrases.add)

        voice.toggle()
        #expect(await eventually { await speech.isListening })
        speech.hear("такси 18 тысяч")
        #expect(await eventually { await voice.transcript == "такси 18 тысяч" })
        voice.toggle()

        #expect(await eventually { await phrases.all == ["такси 18 тысяч"] })
        #expect(speech.finishes == 1)
    }

    @Test("отмена — ничего не записано")
    func cancelWritesNothing() async throws {
        let speech = FakeSpeech()
        let phrases = Phrases()
        let voice = makeVoice(speech, submit: phrases.add)

        voice.start()
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 250 тысяч")
        voice.cancel()

        #expect(await eventually { await voice.phase == .idle })
        try await Task.sleep(for: .milliseconds(300))
        #expect(phrases.all.isEmpty)
        #expect(voice.problem == nil)
    }

    @Test("ничего не сказал — «не расслышал», ничего не записано")
    func nothingHeard() async throws {
        let speech = FakeSpeech()
        let phrases = Phrases()
        let voice = makeVoice(speech, silenceAtStart: .milliseconds(150), submit: phrases.add)

        voice.start()

        #expect(await eventually { await voice.problem == .nothingHeard })
        #expect(voice.phase == .idle)
        #expect(phrases.all.isEmpty)
        #expect(VoiceProblem.nothingHeard.needsKeyboard == false)
    }

    @Test("распознавание оборвалось — сообщение и клавиатура, ничего не записано")
    func recognitionBrokeOff() async throws {
        let speech = FakeSpeech()
        let phrases = Phrases()
        let voice = makeVoice(speech, submit: phrases.add)

        voice.start()
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 25")
        speech.fail()

        #expect(await eventually { await voice.problem == .failed })
        #expect(phrases.all.isEmpty)
        #expect(VoiceProblem.failed.needsKeyboard)
    }

    @Test(
        "микрофон или распознавание запрещены — сообщение и клавиатура, iOS второй раз не спрашивают",
        arguments: [
            (Permission.denied, Permission.granted, VoiceProblem.microphoneDenied),
            (.granted, .denied, .recognitionDenied),
        ]
    )
    func deniedPermission(microphone: Permission, recognition: Permission, problem: VoiceProblem) async {
        let speech = FakeSpeech()
        speech.microphoneState = microphone
        speech.recognitionState = recognition
        let voice = makeVoice(speech)

        voice.start()

        #expect(await eventually { await voice.problem == problem })
        #expect(speech.microphoneRequests == 0)
        #expect(speech.recognitionRequests == 0)
        #expect(speech.starts == 0)
        #expect(problem.needsKeyboard)
        #expect(problem.opensSettings)
    }

    @Test("разрешения спрашиваются один раз: второй запуск идёт без вопросов")
    func asksOnce() async {
        let speech = FakeSpeech()
        speech.microphoneState = .notAsked
        speech.recognitionState = .notAsked
        let voice = makeVoice(speech)

        voice.start()
        #expect(await eventually { await speech.isListening })
        voice.cancel()
        #expect(await eventually { await voice.phase == .idle })
        voice.start()
        #expect(await eventually { await speech.isListening })

        #expect(speech.microphoneRequests == 1)
        #expect(speech.recognitionRequests == 1)
        #expect(speech.starts == 2)
    }

    @Test("в первый раз отказали — сообщение и клавиатура, слушать не начинает")
    func refusedInDialog() async {
        let speech = FakeSpeech()
        speech.microphoneState = .notAsked
        speech.answer = .denied
        let voice = makeVoice(speech)

        voice.start()

        #expect(await eventually { await voice.problem == .microphoneDenied })
        #expect(speech.starts == 0)
    }

    @Test(
        "русского распознавания на телефоне нет — сообщение и клавиатура",
        arguments: [
            (RussianRecognition.networkOnly, VoiceProblem.noRussianDictation),
            (.unavailable, .unavailable),
            (.missing, .unavailable),
        ]
    )
    func noRussianOnPhone(state: RussianRecognition, problem: VoiceProblem) async {
        let speech = FakeSpeech()
        speech.russianState = state
        let voice = makeVoice(speech)

        voice.start()

        #expect(await eventually { await voice.problem == problem })
        #expect(speech.starts == 0)
        #expect(problem.needsKeyboard)
        #expect(problem.opensSettings == false)
    }

    @Test("микрофон не включился — сообщение и клавиатура")
    func microphoneDidNotStart() async {
        let speech = FakeSpeech()
        speech.startFails = true
        let voice = makeVoice(speech)

        voice.start()

        #expect(await eventually { await voice.problem == .failed })
        #expect(voice.phase == .idle)
    }

    @Test("фраза не сохранилась на телефоне — сообщение, фраза остаётся на экране")
    func notSaved() async throws {
        let speech = FakeSpeech()
        let voice = makeVoice(speech) { _ in throw QueueError.unavailable }

        voice.start()
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 25 тысяч")

        #expect(await eventually { await voice.problem == .notSaved })
        #expect(voice.transcript == "кофе 25 тысяч")
    }

    @Test("сообщения — по-русски, у «скачай диктовку» путь в Настройках")
    func messages() {
        #expect(VoiceProblem.noRussianDictation.message.contains("русскую диктовку"))
        #expect(VoiceProblem.microphoneDenied.message.contains("Микрофон"))
        #expect(VoiceProblem.nothingHeard.message == "Не расслышал — скажи ещё раз или напиши")
    }
}
