import Foundation
import Testing
@testable import Kapelka

/// A payment from the Wallet automation in the phone's queue and on its way to `POST /api/quick-capture/payment`
/// (FT-179; contract FT-176 — `docs/QUICK_CAPTURE_API.md`, «Payments»).
@Suite("Оплаты Apple Pay")
struct PaymentQueueTests {
    /// The TBC card's payment of 2026-10-30, as Wallet showed it.
    private static let mazzali = PaymentInput(
        amount: "28\u{00A0}000,00\u{00A0}UZS",
        merchant: "Ooo Mazzali Super Food",
        card: "TBC Uzbekistan"
    )

    @Test("оплата лежит на диске до первой попытки, сеть для этого не нужна")
    func writtenBeforeSending() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let queue = harness.makeQueue()
        let capture = try await queue.addPayment(Self.mazzali)
        #expect(await harness.transport.requests.isEmpty)

        await queue.flush()

        let saved = try #require(try harness.store.load().captures.first)
        #expect(saved.clientId == capture.clientId)
        #expect(saved.state == .pending)
        #expect(saved.payment == Payment(
            walletAmount: "28\u{00A0}000,00\u{00A0}UZS",
            amount: "28000.00",
            currency: "UZS",
            merchant: "Ooo Mazzali Super Food",
            card: "TBC Uzbekistan"
        ))
    }

    @Test("уходит на /payment полями: сумма без изменений, валюта, магазин, clientId и время оплаты")
    func sentAsFields() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        let capture = try await queue.addPayment(Self.mazzali)
        await queue.flush()

        let request = try #require(await harness.transport.requests.first)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "https://kapelka-pc.example-tailnet.ts.net/api/quick-capture/payment")
        #expect(request.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
        #expect(request.timeoutInterval == 60)
        let body = try #require(try await harness.transport.paymentBodies().first)
        #expect(body == .init(
            amount: "28000.00",
            currency: "UZS",
            merchant: "Ooo Mazzali Super Food",
            accountName: nil,
            clientId: capture.clientId.uuidString.lowercased(),
            capturedAt: "2026-10-29T14:32:05+05:00"
        ))
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("несопоставленная карта уходит без accountName и без text: сервер ставит счёт по умолчанию")
    func unmappedCardSendsNoAccount() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        _ = try await queue.addPayment(Self.mazzali)
        await queue.flush()

        let keys = try #require(try await harness.transport.bodyKeys().first)
        #expect(keys == ["amount", "capturedAt", "clientId", "currency", "merchant"])
    }

    @Test("сопоставленная карта уходит с именем счёта")
    func mappedCardSendsAccount() async throws {
        let harness = try QueueHarness()
        harness.cards.map("TBC Uzbekistan", to: "Карта")
        let queue = harness.makeQueue()
        _ = try await queue.addPayment(Self.mazzali)
        await queue.flush()

        #expect(try await harness.transport.paymentBodies().map(\.accountName) == ["Карта"])
    }

    @Test("счёт берётся при отправке: карту сопоставили, пока оплата ждала, — повтор с тем же clientId уже со счётом")
    func accountAtSendTime() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.cannotConnectToHost)]))
        let queue = harness.makeQueue()
        _ = try await queue.addPayment(Self.mazzali)
        await queue.flush()
        harness.cards.map("TBC Uzbekistan", to: "Карта")
        await queue.flush()

        let bodies = try await harness.transport.paymentBodies()
        #expect(bodies.map(\.accountName) == [nil, "Карта"])
        #expect(Set(bodies.map(\.clientId)).count == 1)
        #expect(Set(bodies.map(\.capturedAt)).count == 1)
    }

    @Test(
        "не уходит, но видна в списке с причиной: другая валюта, ноль, непонятная сумма, нет суммы или валюты",
        arguments: [
            ("10,00 €", "валюта EUR"),
            ("0,00 UZS", "сумму 0"),
            ("28 000,000 UZS", "не понял сумму «28 000,000 UZS»"),
            ("", "не передал сумму"),
            ("28 000,00", "нет валюты"),
            ("2 000 000 000 UZS", "больше 1 000 000 000"),
        ]
    )
    func keptOnPhone(amount: String, reason: String) async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        let capture = try await queue.addPayment(PaymentInput(amount: amount, merchant: "Shop", card: "TBC Uzbekistan"))
        await queue.flush()

        #expect(await harness.transport.requests.isEmpty)
        let saved = try #require(try harness.store.load().captures.first)
        #expect(saved.clientId == capture.clientId)
        #expect(saved.state == .rejected)
        #expect(saved.attempts == 0)
        #expect(saved.rejection?.contains(reason) == true)
        #expect(saved.payment?.walletAmount == amount)
    }

    @Test("валюта из автоматизации — для суммы без валюты")
    func currencyFromAutomation() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        _ = try await queue.addPayment(PaymentInput(amount: "4.50", currency: .usd, merchant: "APPLE.COM/BILL", card: "Visa"))
        await queue.flush()

        let body = try #require(try await harness.transport.paymentBodies().first)
        #expect(body.amount == "4.50")
        #expect(body.currency == "USD")
    }

    @Test("магазин и карта без пробелов по краям; пустые — нет поля; магазин не длиннее 200 символов")
    func tidiesMerchantAndCard() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        let tidy = try await queue.addPayment(PaymentInput(amount: "1 UZS", merchant: "  Ooo  Mazzali\u{00A0}Super  ", card: " TBC Uzbekistan "))
        let blank = try await queue.addPayment(PaymentInput(amount: "1 UZS", merchant: "  ", card: ""))
        let long = try await queue.addPayment(PaymentInput(amount: "1 UZS", merchant: String(repeating: "A", count: 250)))

        #expect(tidy.payment?.merchant == "Ooo Mazzali Super")
        #expect(tidy.payment?.card == "TBC Uzbekistan")
        #expect(blank.payment?.merchant == nil)
        #expect(blank.payment?.card == nil)
        #expect(long.payment?.merchant?.count == 200)

        await queue.flush()
        let keys = try await harness.transport.bodyKeys()
        #expect(keys[1] == ["amount", "capturedAt", "clientId", "currency"])
    }

    @Test("фраза и оплата — одна очередь: по одной, старые первыми, каждая своим путём")
    func oneQueueForBoth() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        _ = try await queue.addPayment(Self.mazzali)
        _ = try await queue.add("такси 18к")
        await queue.flush()

        #expect(await harness.transport.requests.map { $0.url?.path() } == [
            "/api/quick-capture", "/api/quick-capture/payment", "/api/quick-capture",
        ])
        #expect(await harness.transport.maxInFlight == 1)
    }

    @Test("ответ сервера — итог в списке; 400 — ошибка у оплаты, больше не уходит")
    func serverAnswers() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(200, body: ServerReply.saved(summary: "Ooo Mazzali Super Food · 28 000 сум · Кафе?")),
            .http(400, body: ServerReply.paymentAmountRefused),
        ]))
        let queue = harness.makeQueue()
        _ = try await queue.addPayment(Self.mazzali)
        _ = try await queue.addPayment(PaymentInput(amount: "5 UZS", merchant: "Shop"))
        await queue.flush()
        await queue.flush()

        let captures = try harness.store.load().captures
        #expect(captures.map(\.state) == [.sent, .rejected])
        #expect(captures[0].reply?.summary == "Ooo Mazzali Super Food · 28 000 сум · Кафе?")
        #expect(RejectionText.shown(for: captures[1].rejection) == "сервер не понял сумму")
        #expect(await harness.transport.requests.count == 2)
    }

    @Test("оплата переживает перезапуск приложения: уходит с тем же clientId и временем оплаты")
    func survivesRestart() async throws {
        let harness = try QueueHarness()
        let capture = try await harness.makeQueue().addPayment(Self.mazzali)

        let restarted = harness.makeQueue()
        await restarted.flush()

        let body = try #require(try await harness.transport.paymentBodies().first)
        #expect(body.clientId == capture.clientId.uuidString.lowercased())
        #expect(body.capturedAt == "2026-10-29T14:32:05+05:00")
    }

    @Test("оплата пришла, пока идёт отправка, — уходит в том же проходе, по одной, один раз")
    func paymentDuringSend() async throws {
        let harness = try QueueHarness(transport: FakeTransport(latency: .milliseconds(50)))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        let sending = Task { await queue.flush() }
        #expect(await eventually { await harness.transport.requests.count == 1 })
        let payment = try await queue.addPayment(Self.mazzali)
        await queue.flush()
        await sending.value

        #expect(try harness.store.load().captures.map(\.state) == [.sent, .sent])
        #expect(await harness.transport.maxInFlight == 1)
        let ids = await harness.transport.requests.compactMap { $0.url?.path() }
        #expect(ids == ["/api/quick-capture", "/api/quick-capture/payment"])
        #expect(try harness.store.load().captures.last?.clientId == payment.clientId)
    }

    @Test("оплата, не ушедшая с телефона, после перезапуска так и не уходит")
    func refusedSurvivesRestart() async throws {
        let harness = try QueueHarness()
        _ = try await harness.makeQueue().addPayment(PaymentInput(amount: "10,00 €", merchant: "Shop"))

        let restarted = harness.makeQueue()
        await restarted.flush()

        #expect(await harness.transport.requests.isEmpty)
        let saved = try #require(try harness.store.load().captures.first)
        #expect(saved.state == .rejected)
        #expect(saved.payment?.walletAmount == "10,00 €")
    }

    @Test("файл прошлой версии без оплат читается: записи остаются фразами")
    func olderFileHasPhrasesOnly() async throws {
        let harness = try QueueHarness()
        let older = """
            {"captures":[{"clientId":"3903229C-4ACB-4547-8620-13DC3B9FAA9E","text":"кофе 25к",\
            "capturedAt":815000000,"timeZoneIdentifier":"Asia/Tashkent"}]}
            """
        try Data(older.utf8).write(to: harness.store.fileURL)

        await harness.makeQueue().flush()

        #expect(try harness.store.load().captures.first?.payment == nil)
        #expect(await harness.transport.requests.map { $0.url?.path() } == ["/api/quick-capture"])
    }
}
