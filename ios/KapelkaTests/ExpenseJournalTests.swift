import Foundation
import Testing
@testable import Kapelka

/// «Записать трату» in the journal (#241). The command only opens the app and asks to listen; its run goes on on the
/// screen — the press taken, the phrase on the phone, its send — and ends when the microphone is done.
@MainActor
@Suite("Журнал команд: «Записать трату»")
final class ExpenseJournalTests {
    private let journals: JournalHarness

    init() throws {
        journals = try JournalHarness()
    }

    private func makeVoice(
        _ harness: QueueHarness,
        journal: CommandJournal,
        speech: FakeSpeech,
        pause: Duration = .milliseconds(150),
        silenceAtStart: Duration = .seconds(5)
    ) -> (VoiceCapture, ExpenseRuns) {
        let runs = ExpenseRuns(journal: journal, queue: harness.makeQueue(), isConfigured: { true })
        let voice = VoiceCapture(
            system: speech,
            listener: speech,
            pause: pause,
            silenceAtStart: silenceAtStart,
            ended: { runs.voiceEnded($0) },
            submit: { try await runs.write($0) }
        )
        return (voice, runs)
    }

    /// A press of the Action Button as the app takes it (`RootView`).
    private func press(_ request: ListenRequest, journal: CommandJournal, voice: VoiceCapture, runs: ExpenseRuns) async {
        await RecordExpenseIntent.ask(journal: journal, request: request)
        guard request.take() else { return }
        runs.pressed(request.takeRuns(), phase: voice.phase)
        voice.commandPressed()
    }

    private func allEnded(_ journal: CommandJournal, count: Int = 1) async -> [JournalRun] {
        _ = await eventually { await journal.runs().count { $0.outcome != .going } == count }
        return await journal.runs()
    }

    @Test("фраза из команды: жду экран, слушаю, фраза в очереди с clientId, отправка, конец")
    func phraseFromCommand() async throws {
        let harness = try QueueHarness()
        let journal = journals.makeJournal()
        let speech = FakeSpeech()
        let (voice, runs) = makeVoice(harness, journal: journal, speech: speech)

        await press(ListenRequest(), journal: journal, voice: voice, runs: runs)
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 25 тысяч")

        let run = try #require(await allEnded(journal).first)
        let id = try #require(try harness.store.load().captures.first).clientId.uuidString
        #expect(run.command == .recordExpense)
        #expect(run.texts == ["начало", "жду экран", "слушаю", "фраза в очереди · \(id)", "отправка: записано"])
        #expect(run.outcome == .finished(ms: 0))
    }

    @Test("ничего не сказано — «без фразы» с причиной и конец: запуск не висит")
    func nothingSaid() async throws {
        let journal = journals.makeJournal()
        let speech = FakeSpeech()
        let (voice, runs) = makeVoice(try QueueHarness(), journal: journal, speech: speech, silenceAtStart: .milliseconds(100))

        await press(ListenRequest(), journal: journal, voice: voice, runs: runs)

        let run = try #require(await allEnded(journal).first)
        #expect(run.texts == ["начало", "жду экран", "слушаю", "без фразы: \(VoiceProblem.nothingHeard.message)"])
        #expect(run.outcome == .finished(ms: 0))
    }

    @Test("второе нажатие заканчивает фразу — оба запуска видят её")
    func secondPressEndsPhrase() async throws {
        let harness = try QueueHarness()
        let journal = journals.makeJournal()
        let speech = FakeSpeech()
        // A pause long enough that only the second press ends the phrase
        let (voice, runs) = makeVoice(harness, journal: journal, speech: speech, pause: .seconds(30))
        let request = ListenRequest()

        await press(request, journal: journal, voice: voice, runs: runs)
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 25 тысяч")
        #expect(await eventually { await voice.transcript == "кофе 25 тысяч" })
        await press(request, journal: journal, voice: voice, runs: runs)

        let ended = await allEnded(journal, count: 2)
        let id = try #require(try harness.store.load().captures.first).clientId.uuidString
        #expect(ended.map(\.texts) == [
            ["начало", "жду экран", "заканчиваю фразу", "фраза в очереди · \(id)", "отправка: записано"],
            ["начало", "жду экран", "слушаю", "фраза в очереди · \(id)", "отправка: записано"],
        ])
    }

    @Test("фраза не легла на телефон — запуск с ошибкой и её текстом")
    func notSaved() async throws {
        let harness = try QueueHarness()
        _ = try await harness.makeQueue().add("кофе 25к")
        let path = harness.store.fileURL.path()
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path) }
        let journal = journals.makeJournal()
        let speech = FakeSpeech()
        let (voice, runs) = makeVoice(harness, journal: journal, speech: speech)

        await press(ListenRequest(), journal: journal, voice: voice, runs: runs)
        #expect(await eventually { await speech.isListening })
        speech.hear("такси 30 тысяч")

        let run = try #require(await allEnded(journal).first)
        #expect(run.texts == ["начало", "жду экран", "слушаю"])
        #expect(run.outcome == .failed(ms: 0, message: try #require(QueueError.unavailable.errorDescription)))
        #expect(voice.problem == .notSaved)
    }

    @Test("фраза с кнопки микрофона, не из команды, — в журнале ничего")
    func phraseFromScreen() async throws {
        let harness = try QueueHarness()
        let journal = journals.makeJournal()
        let speech = FakeSpeech()
        let (voice, _) = makeVoice(harness, journal: journal, speech: speech)

        voice.start()
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 25 тысяч")
        #expect(try await eventually { try harness.store.load().captures.map(\.state) == [.sent] })

        #expect(await journal.runs().isEmpty)
    }

    @Test("журнал не пишется — фраза ложится и уходит, как без него")
    func brokenJournal() async throws {
        let harness = try QueueHarness()
        let broken = CommandJournal(storage: BrokenStorage(), uptime: { .zero })
        let speech = FakeSpeech()
        let (voice, runs) = makeVoice(harness, journal: broken, speech: speech)

        await press(ListenRequest(), journal: broken, voice: voice, runs: runs)
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 25 тысяч")

        #expect(try await eventually { try harness.store.load().captures.map(\.state) == [.sent] })
        #expect(voice.problem == nil)
    }

    @Test("нажатия, которые экран ещё не взял, держат свои запуски; просьба берётся один раз")
    func requestKeepsRuns() {
        let request = ListenRequest()
        let first = UUID()
        let second = UUID()

        request.ask(run: first)
        request.ask(run: second)

        #expect(request.take())
        #expect(request.take() == false)
        #expect(request.takeRuns() == [first, second])
        #expect(request.takeRuns().isEmpty)
    }
}
