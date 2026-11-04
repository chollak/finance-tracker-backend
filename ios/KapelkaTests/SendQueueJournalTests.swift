import Foundation
import Testing
@testable import Kapelka

/// «Отправить очередь» in the journal (#241): how many waited, what the send did, the dialog it answered, the end. Its
/// answer is the same with the journal or without one.
@Suite("Журнал команд: «Отправить очередь»")
final class SendQueueJournalTests {
    private let journals: JournalHarness

    init() throws {
        journals = try JournalHarness()
    }

    private func makeCommand(
        _ harness: QueueHarness,
        journal: CommandJournal,
        configured: Bool = true
    ) -> (SendQueueCommand, CaptureQueue) {
        let queue = harness.makeQueue()
        let command = SendQueueCommand(
            queue: queue,
            send: { await queue.flush() },
            isConfigured: { configured },
            journal: journal
        )
        return (command, queue)
    }

    @Test("всё ушло — начало, ждут: 2, «всё отправлено», окно, конец; ответ команды тот же")
    func allSent() async throws {
        let harness = try QueueHarness()
        let journal = journals.makeJournal()
        let (command, queue) = makeCommand(harness, journal: journal)
        _ = try await queue.add("кофе 25к")
        _ = try await queue.add("такси 30к")

        let report = await command.run()

        #expect(report == "Всё отправлено")
        let run = try #require(await journal.runs().first)
        #expect(run.command == .sendQueue)
        #expect(run.texts == ["начало", "ждут: 2", "отправка: всё отправлено", "окно: «Всё отправлено»"])
        #expect(run.outcome == .finished(ms: 0))
    }

    @Test("нет связи — сколько ждёт и почему; окно — как без журнала")
    func offline() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let journal = journals.makeJournal()
        let (command, queue) = makeCommand(harness, journal: journal)
        _ = try await queue.add("кофе 25к")

        let report = await command.run()

        #expect(report == "В очереди: 1 — нет связи, уйдёт, когда появится сеть")
        #expect(try #require(await journal.runs().first).texts == [
            "начало",
            "ждут: 1",
            "отправка: ждут 1 — нет связи",
            "окно: «В очереди: 1 — нет связи, уйдёт, когда появится сеть»",
        ])
    }

    @Test(
        "не ушло — окно говорит почему: нет связи, сервер не ответил, просит подождать (#236)",
        arguments: [
            (FakeTransport.Reply.failure(.notConnectedToInternet), "В очереди: 1 — нет связи, уйдёт, когда появится сеть"),
            (.failure(.cannotFindHost), "В очереди: 1 — нет связи, уйдёт, когда появится сеть"),
            (.failure(.timedOut), "В очереди: 1 — сервер не ответил, уйдёт позже"),
            (.http(502, body: "Bad Gateway"), "В очереди: 1 — сервер не ответил, уйдёт позже"),
            (.http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "120"]), "В очереди: 1 — сервер просит подождать, уйдёт позже"),
        ]
    )
    func waitsWithReason(reply: FakeTransport.Reply, dialog: String) async throws {
        let harness = try QueueHarness(transport: FakeTransport([reply]))
        let (command, queue) = makeCommand(harness, journal: journals.makeJournal())
        _ = try await queue.add("кофе 25к")

        #expect(await command.run() == dialog)
    }

    @Test("пусто — «нечего отправлять»")
    func nothingToSend() async throws {
        let journal = journals.makeJournal()
        let (command, _) = makeCommand(try QueueHarness(), journal: journal)

        _ = await command.run()

        #expect(try #require(await journal.runs().first).texts == [
            "начало", "ждут: 0", "отправка: нечего отправлять", "окно: «Всё отправлено»",
        ])
    }

    @Test("нет адреса и токена — «не настроено»")
    func notConfigured() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let journal = journals.makeJournal()
        let (command, queue) = makeCommand(harness, journal: journal, configured: false)
        _ = try await queue.add("кофе 25к")

        _ = await command.run()

        #expect(try #require(await journal.runs().first).texts.dropFirst(2).first == "отправка: ждут 1 — не настроено")
    }

    @Test("iOS отменил команду, процесс жив — «iOS отменил команду» перед концом")
    func cancelledByIOS() async throws {
        let harness = try QueueHarness()
        let journal = journals.makeJournal()
        let queue = harness.makeQueue()
        let command = SendQueueCommand(
            queue: queue,
            send: { withUnsafeCurrentTask { $0?.cancel() } },
            isConfigured: { true },
            journal: journal
        )
        _ = try await queue.add("кофе 25к")

        _ = await Task { await command.run() }.value

        let run = try #require(await journal.runs().first)
        // Nothing went, so no reason: the neutral «уйдёт позже»
        #expect(Array(run.texts.suffix(2)) == ["окно: «В очереди: 1 — уйдёт позже»", "iOS отменил команду"])
        #expect(run.outcome == .finished(ms: 0))
    }

    @Test("журнал не пишется — очередь уходит, ответ тот же")
    func brokenJournal() async throws {
        let harness = try QueueHarness()
        let broken = CommandJournal(storage: BrokenStorage(), uptime: { .zero })
        let (command, queue) = makeCommand(harness, journal: broken)
        _ = try await queue.add("кофе 25к")

        #expect(await command.run() == "Всё отправлено")
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("оплата во время «Отправить очередь» — два запуска, у каждого свой id и свой конец")
    func paymentMeanwhile() async throws {
        let answer = Gate()
        let harness = try QueueHarness(transport: FakeTransport([.held(answer, .http(200))]))
        let journal = journals.makeJournal()
        let (command, queue) = makeCommand(harness, journal: journal)
        let suite = "kapelka-tests-send-journal-\(UUID().uuidString)"
        defer { UserDefaults.standard.removePersistentDomain(forName: suite) }
        let recorder = PaymentRecorder(
            queue: queue,
            cards: CardAccountStore(defaults: try #require(UserDefaults(suiteName: suite))),
            send: { await queue.flush() },
            isConfigured: { true },
            notify: { _ in },
            journal: journal
        )
        _ = try await queue.add("кофе 25к")

        // The payment comes while the queue's request is in flight, and is on the phone before the answer
        async let sending = command.run()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        async let paying: Void = recorder.record(PaymentInput(amount: "12 345,00 UZS", merchant: "Магазин у дома"))
        #expect(try await eventually { try harness.store.load().captures.count == 2 })
        answer.open()
        _ = await sending
        try await paying

        let runs = await journal.runs()
        #expect(Set(runs.map(\.command)) == [.sendQueue, .recordPayment])
        #expect(Set(runs.map(\.id)).count == 2)
        #expect(runs.allSatisfy { if case .finished = $0.outcome { true } else { false } })
    }
}
