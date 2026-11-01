import Foundation
import Testing
@testable import Kapelka

/// «Записать оплату» from the Wallet automation: the payment on disk first, the card noticed for the settings, one try
/// to send, and one notification line on the result instead of a dialog to dismiss (FT-179, Shukur's decision of
/// 2026-10-30). What the server answered is the pass's notification (FT-253, `BackgroundNoticeFlowTests`): the command
/// itself tells only «уйдёт позже» and a refusal on the phone.
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

    private let notices = PostedNotices()

    private func makeRecorder(_ harness: QueueHarness, configured: Bool = true) throws -> (PaymentRecorder, CardAccountStore) {
        let cards = CardAccountStore(defaults: try #require(UserDefaults(suiteName: suite)))
        let queue = harness.makeQueue()
        let notices = notices
        let recorder = PaymentRecorder(
            queue: queue,
            cards: cards,
            send: { await queue.flush() },
            isConfigured: { configured },
            notify: { await notices.post($0) }
        )
        return (recorder, cards)
    }

    /// A waiting payment names the amount as its later «Записал: …» will (`MoneyText`), not as Wallet wrote it.
    private static let mazzaliLine = "Ooo Mazzali Super Food · \u{2212}28\u{00A0}000\u{00A0}сум"

    @Test("записалось или «нужно проверить» — команда своего уведомления не шлёт: «Записал: …» даёт проход (FT-253)")
    func recordedOnline() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(200, body: ServerReply.saved(summary: "Ooo Mazzali Super Food · 28 000 сум · Кафе")),
            .http(200, body: ServerReply.saved(
                status: "needs_review",
                title: "Нужно проверить",
                summary: "Ytt Abduvoxidov Davronbek · 25 000 сум · Другое?"
            )),
        ]))
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(Self.mazzali)
        try await recorder.record(PaymentInput(amount: "25 000,00 UZS", merchant: "Ytt Abduvoxidov Davronbek", card: "TBC Uzbekistan"))

        #expect(await notices.texts.isEmpty)
        #expect(try harness.store.load().captures.map(\.state) == [.sent, .sent])
    }

    @Test("сервера нет — оплата в очереди, в уведомлении: уйдёт позже, сумма как в «Записал: …»")
    func queuedOffline() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(Self.mazzali)

        #expect(await notices.texts == ["\(Self.mazzaliLine) — уйдёт позже"])
        #expect(await notices.places == [.capture])
        #expect(try harness.store.load().captures.map(\.state) == [.pending])
    }

    @Test("другая валюта — не отправляется, в уведомлении причина")
    func otherCurrency() async throws {
        let harness = try QueueHarness()
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(PaymentInput(amount: "10,00 €", merchant: "Shop", card: "Visa"))

        #expect(await notices.texts == [
            "Не записал: Shop · 10,00 €\nВалюта EUR — Kapelka пишет только сумы и доллары, запиши в Mini App",
        ])
        #expect(await notices.places == [.capture])
        #expect(await harness.transport.requests.isEmpty)
    }

    @Test("Wallet не дал ни магазина, ни суммы — уведомление всё равно говорит, что это за оплата")
    func nothingFromWallet() async throws {
        let harness = try QueueHarness()
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(PaymentInput())

        #expect(await notices.texts == ["Не записал: Оплата Apple Pay\nWallet не передал сумму — запиши в Mini App"])
    }

    @Test("сервер отказал (400) — команда молчит: «Не записал: …» даёт проход (FT-253)")
    func refusedByServer() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(400, body: ServerReply.paymentAmountRefused)]))
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(Self.mazzali)

        #expect(await notices.texts.isEmpty)
        #expect(try harness.store.load().captures.map(\.state) == [.rejected])
    }

    @Test("без адреса или с отказом в токене — оплата в очереди, уведомление просит настройки")
    func notConfigured() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let (recorder, _) = try makeRecorder(harness, configured: false)
        try await recorder.record(Self.mazzali)

        let refused = try QueueHarness(transport: FakeTransport([.http(401, body: ServerReply.invalidToken)]))
        let (recorderRefused, _) = try makeRecorder(refused)
        try await recorderRefused.record(Self.mazzali)

        #expect(await notices.texts == [
            "\(Self.mazzaliLine) — в очереди: укажи адрес и токен в настройках Kapelka",
            // Why the token: the token's own one notice says it (FT-253)
            "\(Self.mazzaliLine) — в очереди до нового токена",
        ])
        #expect(await notices.places == [.settings, .settings])
    }

    @Test("429 — «сервер просит подождать», а не «нет связи»")
    func rateLimited() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "120"]),
        ]))
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(Self.mazzali)

        #expect(await notices.texts == ["\(Self.mazzaliLine) — сервер просит подождать, уйдёт позже"])
        #expect(await notices.places == [.capture])
    }

    @Test("сумма ждущей оплаты — в сотых, как её покажет «Записал: …»; доллары с центами")
    func waitingAmount() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(PaymentInput(amount: "4.50", currency: .usd, merchant: "APPLE.COM/BILL"))

        #expect(await notices.texts == ["APPLE.COM/BILL · \u{2212}4,50\u{00A0}USD — уйдёт позже"])
        let payment = try #require(try harness.store.load().captures.first?.payment)
        #expect(payment.amountMinor == 450)
    }

    @Test("сумма контракта в сотых: целые, копейки, нет суммы")
    func amountMinor() {
        func payment(_ amount: String?) -> Payment {
            Payment(walletAmount: "", amount: amount, currency: "UZS", merchant: nil, card: nil)
        }
        #expect(payment("28000.00").amountMinor == 2_800_000)
        #expect(payment("25000").amountMinor == 2_500_000)
        #expect(payment("4.5").amountMinor == 450)
        #expect(payment("1000000000.00").amountMinor == 100_000_000_000)
        #expect(payment(nil).amountMinor == nil)
        #expect(payment("12,50").amountMinor == nil)
        #expect(payment("1.234").amountMinor == nil)
    }

    @Test("одно уведомление на оплату, под её clientId; оплата уже на диске, когда оно уходит")
    func oneNoticePerPayment() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(Self.mazzali)
        try await recorder.record(PaymentInput(amount: "10,00 €", merchant: "Shop"))

        let ids = try harness.store.load().captures.map(\.clientId.uuidString)
        #expect(await notices.ids == ids)
    }

    @Test("ПК спит: уведомление в срок фона, оплата ждёт, повтор — с тем же clientId")
    func sleepingServer() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.hang]))
        let cards = CardAccountStore(defaults: try #require(UserDefaults(suiteName: suite)))
        let queue = harness.makeQueue()
        let clock = harness.clock
        let background = BackgroundSend(
            queue: queue,
            scheduler: FakeRefreshScheduler(),
            now: { clock.now },
            budget: .milliseconds(200)
        )
        let notices = notices
        let recorder = PaymentRecorder(
            queue: queue,
            cards: cards,
            send: { await background.run() },
            isConfigured: { true },
            notify: { await notices.post($0) }
        )

        let started = ContinuousClock.now
        try await recorder.record(Self.mazzali)

        #expect(ContinuousClock.now - started < .seconds(2))
        // Not «нет связи»: the network is there, the PC does not answer
        #expect(await notices.texts == ["\(Self.mazzaliLine) — уйдёт позже"])
        let waiting = try #require(try harness.store.load().captures.first)
        #expect(waiting.state == .pending)
        #expect(waiting.attempts == 0)

        await queue.flush()
        let ids = try await harness.transport.paymentBodies().map(\.clientId)
        #expect(ids == [waiting.clientId.uuidString.lowercased(), waiting.clientId.uuidString.lowercased()])
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("сумма без кода: валюта карты из настроек важнее валюты автоматизации — $4.50 не ляжет как 4,50 сум")
    func cardCurrencyBeforeAutomation() async throws {
        let harness = try QueueHarness()
        let (recorder, cards) = try makeRecorder(harness)
        cards.noticed("Visa Kapitalbank")
        try cards.save([CardAccount(card: "Visa Kapitalbank", account: "", currency: .usd)], removing: [])

        try await recorder.record(PaymentInput(amount: "4.50", currency: .uzs, merchant: "APPLE.COM/BILL", card: "Visa Kapitalbank"))

        let body = try #require(try await harness.transport.paymentBodies().first)
        #expect(body.amount == "4.50")
        #expect(body.currency == "USD")
    }

    @Test("код в сумме важнее валюты карты")
    func walletCodeBeforeCardCurrency() async throws {
        let harness = try QueueHarness()
        let (recorder, cards) = try makeRecorder(harness)
        cards.noticed("TBC Uzbekistan")
        try cards.save([CardAccount(card: "TBC Uzbekistan", account: "", currency: .usd)], removing: [])

        try await recorder.record(Self.mazzali)

        #expect(try await harness.transport.paymentBodies().map(\.currency) == ["UZS"])
    }

    @Test("у карты нет валюты — валюта автоматизации; нет и её — не отправлено, причина про валюту карты")
    func automationCurrencyThenNothing() async throws {
        let harness = try QueueHarness()
        let (recorder, _) = try makeRecorder(harness)

        try await recorder.record(PaymentInput(amount: "4.50", currency: .usd, merchant: "Shop", card: "Visa"))
        try await recorder.record(PaymentInput(amount: "4.50", merchant: "Shop", card: "Visa"))

        #expect(try await harness.transport.paymentBodies().map(\.currency) == ["USD"])
        #expect(await notices.texts.last?.contains("укажи валюту карты в настройках Kapelka") == true)
        #expect(try harness.store.load().captures.map(\.state) == [.sent, .rejected])
    }

    @Test("карта оплаты появляется в настройках без счёта")
    func cardNoticed() async throws {
        let harness = try QueueHarness()
        let (recorder, cards) = try makeRecorder(harness)

        try await recorder.record(Self.mazzali)

        #expect(cards.cards == [CardAccount(card: "TBC Uzbekistan", account: "")])
    }

    @Test("файл очереди закрыт (до первой разблокировки) — команда падает с ошибкой, а не молчит; уведомления нет")
    func lockedQueueFails() async throws {
        let harness = try QueueHarness()
        _ = try await harness.makeQueue().add("кофе 25к")
        let path = harness.store.fileURL.path()
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path) }
        let (recorder, _) = try makeRecorder(harness)

        await #expect(throws: QueueError.unavailable) { try await recorder.record(Self.mazzali) }
        #expect(await notices.texts.isEmpty)
    }
}

/// The notifications «Записать оплату» posted, in order.
actor PostedNotices {
    private var posted: [Notice] = []

    var texts: [String] { posted.map(\.body) }
    var ids: [String] { posted.map(\.id) }
    var places: [AppPlace] { posted.map(\.opens) }

    func post(_ notice: Notice) {
        posted.append(notice)
    }
}
