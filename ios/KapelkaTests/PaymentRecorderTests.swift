import Foundation
import Testing
@testable import Kapelka

/// «Записать оплату» from the Wallet automation: the payment on disk first, the card noticed for the settings, one try
/// to send, and what the command answers (FT-179).
@Suite("Команда «Записать оплату»")
final class PaymentRecorderTests {
    private static let mazzali = PaymentInput(
        amount: "28\u{00A0}000,00\u{00A0}UZS",
        merchant: "Ooo Mazzali Super Food",
        card: "TBC Uzbekistan"
    )

    private let suite = "kapelka-tests-recorder-\(UUID().uuidString)"

    deinit {
        UserDefaults.standard.removePersistentDomain(forName: suite)
    }

    private func makeRecorder(_ harness: QueueHarness, configured: Bool = true) throws -> (PaymentRecorder, CardAccountStore) {
        let cards = CardAccountStore(defaults: try #require(UserDefaults(suiteName: suite)))
        let queue = harness.makeQueue()
        let recorder = PaymentRecorder(
            queue: queue,
            cards: cards,
            send: { await queue.flush() },
            isConfigured: { configured }
        )
        return (recorder, cards)
    }

    @Test("сервер доступен — оплата записана, команда отвечает итогом сервера")
    func recordedOnline() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(200, body: ServerReply.saved(summary: "Ooo Mazzali Super Food · 28 000 сум · Кафе?")),
        ]))
        let (recorder, _) = try makeRecorder(harness)

        let answer = try await recorder.record(Self.mazzali)

        #expect(answer == "Записал · Ooo Mazzali Super Food · 28 000 сум · Кафе?")
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("сервера нет — оплата ждёт на телефоне, команда так и говорит")
    func queuedOffline() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let (recorder, _) = try makeRecorder(harness)

        let answer = try await recorder.record(Self.mazzali)

        #expect(answer == "Оплата в очереди: уйдёт, когда сервер будет доступен")
        #expect(try harness.store.load().captures.map(\.state) == [.pending])
    }

    @Test("другая валюта — не отправляется, команда говорит почему")
    func otherCurrency() async throws {
        let harness = try QueueHarness()
        let (recorder, _) = try makeRecorder(harness)

        let answer = try await recorder.record(PaymentInput(amount: "10,00 €", merchant: "Shop", card: "Visa"))

        #expect(answer == "Не записано: валюта EUR — Kapelka пишет только сумы и доллары, запиши в Mini App")
        #expect(await harness.transport.requests.isEmpty)
    }

    @Test("сервер отказал (400) — команда говорит почему")
    func refusedByServer() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(400, body: ServerReply.paymentAmountRefused)]))
        let (recorder, _) = try makeRecorder(harness)

        #expect(try await recorder.record(Self.mazzali) == "Не записано: сервер не понял сумму")
    }

    @Test("без адреса или с отказом в токене — оплата в очереди, команда просит настройки")
    func notConfigured() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let (recorder, _) = try makeRecorder(harness, configured: false)

        #expect(try await recorder.record(Self.mazzali) == "Оплата в очереди. Укажи адрес и токен в настройках Kapelka")

        let refused = try QueueHarness(transport: FakeTransport([.http(401, body: ServerReply.invalidToken)]))
        let (recorderRefused, _) = try makeRecorder(refused)
        #expect(
            try await recorderRefused.record(Self.mazzali)
                == "Оплата в очереди. Сервер не принял токен — проверь токен в настройках Kapelka"
        )
    }

    @Test("карта оплаты появляется в настройках без счёта")
    func cardNoticed() async throws {
        let harness = try QueueHarness()
        let (recorder, cards) = try makeRecorder(harness)

        _ = try await recorder.record(Self.mazzali)

        #expect(cards.cards == [CardAccount(card: "TBC Uzbekistan", account: "")])
    }

    @Test("файл очереди закрыт (до первой разблокировки) — команда падает с ошибкой, а не молчит")
    func lockedQueueFails() async throws {
        let harness = try QueueHarness()
        _ = try await harness.makeQueue().add("кофе 25к")
        let path = harness.store.fileURL.path()
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path) }
        let (recorder, _) = try makeRecorder(harness)

        await #expect(throws: QueueError.unavailable) { try await recorder.record(Self.mazzali) }
    }
}
