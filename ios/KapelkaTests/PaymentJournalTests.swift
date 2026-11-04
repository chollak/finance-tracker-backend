import Foundation
import Testing
@testable import Kapelka

/// «Записать оплату» in the journal (#241): each run's steps — the payment in the queue, what the send did, the
/// notification, the end with its time or the error. The journal never changes what the command does.
@Suite("Журнал команд: «Записать оплату»")
final class PaymentJournalTests {
    private static let input = PaymentInput(amount: "12\u{00A0}345,00\u{00A0}UZS", merchant: "Магазин у дома", card: "Карта")
    private static let line = "Магазин у дома · 12\u{00A0}345,00\u{00A0}UZS"

    private let suite = "kapelka-tests-payment-journal-\(UUID().uuidString)"
    private let notices = PostedNotices()
    private let journals: JournalHarness

    init() throws {
        journals = try JournalHarness()
    }

    deinit {
        UserDefaults.standard.removePersistentDomain(forName: suite)
    }

    private func makeRecorder(
        _ harness: QueueHarness,
        journal: CommandJournal,
        configured: Bool = true
    ) throws -> PaymentRecorder {
        let queue = harness.makeQueue()
        let notices = notices
        return PaymentRecorder(
            queue: queue,
            cards: CardAccountStore(defaults: try #require(UserDefaults(suiteName: suite))),
            send: { await queue.flush() },
            isConfigured: { configured },
            notify: { await notices.post($0) },
            journal: journal
        )
    }

    /// Records one payment and gives its run.
    private func recordedRun(
        _ transport: FakeTransport = FakeTransport(),
        settings: TestSettings = TestSettings(),
        input: PaymentInput = input
    ) async throws -> (JournalRun, QueueHarness) {
        let harness = try QueueHarness(transport: transport, settings: settings)
        let journal = journals.makeJournal()
        let recorder = try makeRecorder(harness, journal: journal, configured: settings.configuration != nil)
        try await recorder.record(input)
        let run = try #require(await journal.runs().first)
        return (run, harness)
    }

    private func clientId(_ harness: QueueHarness) throws -> String {
        try #require(try harness.store.load().captures.last).clientId.uuidString
    }

    @Test("записалось — начало, в очереди с clientId и оплатой, «записано», без своего уведомления, конец")
    func recorded() async throws {
        let (run, harness) = try await recordedRun()

        #expect(run.command == .recordPayment)
        #expect(run.texts == [
            "начало",
            "в очереди · \(try clientId(harness)) · \(Self.line)",
            "отправка: записано",
            "без своего уведомления",
        ])
        #expect(run.outcome == .finished(ms: 0))
    }

    @Test(
        "не ушла — почему: нет связи, сервер не ответил, просит подождать, токен; уведомление поставлено",
        arguments: [
            (FakeTransport.Reply.failure(.notConnectedToInternet), "отправка: нет связи"),
            (.failure(.timedOut), "отправка: сервер не ответил"),
            (.http(502, body: "Bad Gateway"), "отправка: сервер не ответил"),
            (.http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "120"]), "отправка: сервер просит подождать"),
            (.http(401, body: ServerReply.invalidToken), "отправка: токен не принят"),
        ]
    )
    func waits(reply: FakeTransport.Reply, sent: String) async throws {
        let (run, _) = try await recordedRun(FakeTransport([reply]))

        #expect(Array(run.texts.dropFirst(2)) == [sent, "уведомление поставлено"])
        #expect(run.outcome == .finished(ms: 0))
    }

    @Test("нет адреса и токена — «не настроено»")
    func notConfigured() async throws {
        let (run, _) = try await recordedRun(settings: TestSettings(configured: false))

        #expect(Array(run.texts.dropFirst(2)) == ["отправка: не настроено", "уведомление поставлено"])
    }

    @Test("не отправляется (другая валюта) — причина вместо отправки, уведомление поставлено")
    func refusedOnPhone() async throws {
        let (run, harness) = try await recordedRun(input: PaymentInput(amount: "10,00 €", merchant: "Shop", card: "Карта"))

        #expect(run.texts == [
            "начало",
            "в очереди · \(try clientId(harness)) · Shop · 10,00 €",
            "не отправляется: валюта EUR — Kapelka пишет только сумы и доллары, запиши в Mini App",
            "уведомление поставлено",
        ])
        #expect(await harness.transport.requests.isEmpty)
    }

    @Test("очередь закрыта — запуск с ошибкой и её текстом, команда падает, как падала")
    func lockedQueue() async throws {
        let harness = try QueueHarness()
        _ = try await harness.makeQueue().add("кофе 25к")
        let path = harness.store.fileURL.path()
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path) }
        let journal = journals.makeJournal()
        let recorder = try makeRecorder(harness, journal: journal)

        await #expect(throws: QueueError.unavailable) { try await recorder.record(Self.input) }

        let run = try #require(await journal.runs().first)
        #expect(run.texts == ["начало"])
        #expect(run.outcome == .failed(ms: 0, message: try #require(QueueError.unavailable.errorDescription)))
    }

    @Test("длительность — от начала до конца по монотонным часам журнала")
    func duration() async throws {
        let harness = try QueueHarness()
        let journal = journals.makeJournal()
        let uptime = journals.uptime
        let queue = harness.makeQueue()
        let recorder = PaymentRecorder(
            queue: queue,
            cards: CardAccountStore(defaults: try #require(UserDefaults(suiteName: suite))),
            send: {
                uptime.advance(by: .milliseconds(1834))
                await queue.flush()
            },
            isConfigured: { true },
            notify: { _ in },
            journal: journal
        )

        try await recorder.record(Self.input)

        let run = try #require(await journal.runs().first)
        #expect(run.steps.map(\.ms) == [0, 0, 1834, 1834])
        #expect(run.outcome == .finished(ms: 1834))
    }

    @Test("iOS отменил команду посреди отправки, процесс жив — «iOS отменил команду» перед концом")
    func cancelledByIOS() async throws {
        let harness = try QueueHarness()
        let journal = journals.makeJournal()
        let notices = notices
        let recorder = PaymentRecorder(
            queue: harness.makeQueue(),
            cards: CardAccountStore(defaults: try #require(UserDefaults(suiteName: suite))),
            send: { withUnsafeCurrentTask { $0?.cancel() } },
            isConfigured: { true },
            notify: { await notices.post($0) },
            journal: journal
        )

        try await Task { try await recorder.record(Self.input) }.value

        let run = try #require(await journal.runs().first)
        #expect(Array(run.texts.dropFirst(2)) == [
            "отправка: не успела, уйдёт позже",
            "уведомление поставлено",
            "iOS отменил команду",
        ])
        #expect(run.outcome == .finished(ms: 0))
    }

    @Test("журнал не пишется — оплата, отправка и уведомление те же, ошибка очереди та же")
    func brokenJournal() async throws {
        let broken = CommandJournal(storage: BrokenStorage(), uptime: { .zero })
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let recorder = try makeRecorder(harness, journal: broken)

        try await recorder.record(Self.input)

        #expect(await notices.texts == ["Магазин у дома · \u{2212}12\u{00A0}345\u{00A0}сум — нет связи, уйдёт, когда появится сеть"])
        #expect(try harness.store.load().captures.map(\.state) == [.pending])

        let locked = try QueueHarness()
        _ = try await locked.makeQueue().add("кофе 25к")
        let path = locked.store.fileURL.path()
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path) }
        let lockedRecorder = try makeRecorder(locked, journal: broken)
        await #expect(throws: QueueError.unavailable) { try await lockedRecorder.record(Self.input) }
    }

    @Test("журнал на сервер не уходит: запрос — только оплата, без шагов")
    func staysOnPhone() async throws {
        let (_, harness) = try await recordedRun()

        let requests = await harness.transport.requests
        #expect(requests.map { $0.url?.path() } == ["/api/quick-capture/payment"])
        let body = String(decoding: try #require(requests.first?.httpBody), as: UTF8.self)
        #expect(!body.contains("начало"))
        #expect(!body.contains("в очереди"))
    }
}
