import Foundation
import Testing
@testable import Kapelka

/// What the queue keeps of the server's answer, record by record (FT-255): the base of the haptics, the notices, «!»
/// and the card of FT-251…FT-254.
@Suite("Ответ сервера по каждой записи")
struct CaptureReplyTests {
    @Test("оплата из QUICK_CAPTURE_API.md: id, сумма, валюта, категория, счёт, «проверить», догадки")
    func paymentFromDocs() throws {
        #expect(try CaptureReplyBodies.reply(CaptureReplyBodies.paymentFromDocs) == CaptureReply(
            status: "saved",
            title: "Записал",
            summary: "KORZINKA 24 · 25 000 сум · Продукты?",
            records: [
                CapturedRecord(
                    id: "ff1a09d9-b1d4-410a-9f8f-10f872ab580a", type: .expense, amountMinor: 2_500_000,
                    currency: "UZS", category: "Продукты", accountName: "Карта", needsReview: false,
                    assumptions: [.category(name: "Продукты"), .account(name: "Карта", reason: .hint)]
                ),
            ]
        ))
    }

    @Test("фраза «такси 18к» из QUICK_CAPTURE_API.md: счёт по умолчанию — догадка")
    func phraseFromDocs() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.taxiFromDocs)

        #expect(reply.records == [
            CapturedRecord(
                id: "tx-1", type: .expense, amountMinor: 1_800_000, currency: "UZS", category: "Транспорт",
                accountName: "Карта", needsReview: false, assumptions: [.account(name: "Карта", reason: .byDefault)]
            ),
        ])
        #expect(reply.withoutAmount.isEmpty)
        #expect(reply.repeated == false)
    }

    @Test("«кофе 45» с сервера: «понял как 45 000»")
    func thousandsFromServer() throws {
        let record = try #require(try CaptureReplyBodies.reply(CaptureReplyBodies.coffee).records.first)
        #expect(record.assumptions == [
            .thousands(written: "45", amount: 45_000),
            .account(name: "Карта", reason: .byDefault),
        ])
        #expect(record.amountMinor == 4_500_000)
    }

    @Test("догадки всех видов из pastel/api.md")
    func assumptionKindsFromDocs() throws {
        let json = """
            [
              { "kind": "thousands", "written": "45", "amount": 45000 },
              { "kind": "category", "name": "Кафе" },
              { "kind": "account", "name": "Наличные", "reason": "hint" },
              { "kind": "currency", "currency": "USD", "reason": "no_usd_account" }
            ]
            """
        #expect(try JSONDecoder().decode([CaptureAssumption].self, from: Data(json.utf8)) == [
            .thousands(written: "45", amount: 45_000),
            .category(name: "Кафе"),
            .account(name: "Наличные", reason: .hint),
            .currency(code: "USD", reason: .noUsdAccount),
        ])
    }

    @Test("две записи одной фразы — по порядку сервера, у каждой свои догадки и «проверить»")
    func twoRecords() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffeeAndHeadphones)

        #expect(reply.records.map(\.id) == ["rec-coffee", "rec-headphones"])
        #expect(reply.records.map(\.needsReview) == [false, true])
        #expect(reply.records[1] == CapturedRecord(
            id: "rec-headphones", type: .expense, amountMinor: 5500, currency: "USD", category: "Покупки",
            accountName: "Карта", needsReview: true,
            assumptions: [
                .category(name: "Покупки"),
                .account(name: "Карта", reason: .byDefault),
                .currency(code: "USD", reason: .noUsdAccount),
            ]
        ))
    }

    @Test("без суммы: «такси» в «кофе 25к, такси» — в withoutAmount, записи под него нет")
    func withoutAmount() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffeeAndTaxiWithoutAmount)

        #expect(reply.records.map(\.id) == ["rec-coffee"])
        #expect(reply.withoutAmount == [CapturedWithoutAmount(description: "такси", category: "Транспорт")])
    }

    @Test("повтор с сервера: repeated, без счёта и догадок; удалённая запись читается")
    func repeatFromServer() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffeeRepeated)

        #expect(reply.repeated)
        #expect(reply.records == [
            CapturedRecord(
                id: CaptureReplyBodies.coffeeId, type: .expense, amountMinor: 4_500_000, currency: "UZS",
                category: "Кафе", accountName: nil, needsReview: false, assumptions: []
            ),
        ])
    }

    @Test("непонятная догадка и нечитаемая запись выпадают — ответ всё равно «записано», а не «ждёт»")
    func unreadablePartsLeftOut() throws {
        let body = """
            {"success":true,"data":{"status":"saved","transactions":[\
            {"id":"broken","amountMinor":"много","type":"expense"},\
            {"id":"good","amountMinor":2500000,"type":"expense","category":"Кафе","needsReview":false,\
            "assumptions":[{"kind":"weather","name":"дождь"},{"kind":"account","name":"Карта","reason":"later"},\
            {"kind":"category","name":"Кафе"}]}],\
            "withoutAmount":[{"category":"Транспорт"},{"description":"такси"}],\
            "ack":{"title":"Записал","summary":"Кофе · 25 000 сум"}}}
            """
        let reply = try CaptureReplyBodies.reply(body)

        #expect(reply.records == [
            CapturedRecord(
                id: "good", type: .expense, amountMinor: 2_500_000, currency: "UZS", category: "Кафе",
                accountName: nil, needsReview: false, assumptions: [.category(name: "Кафе")]
            ),
        ])
        #expect(reply.withoutAmount == [CapturedWithoutAmount(description: "такси", category: "")])
    }

    @Test("ответ с записями лежит в файле очереди и читается после перезапуска")
    func keptOnDisk() async throws {
        let body = CaptureReplyBodies.coffeeAndHeadphones
        let harness = try QueueHarness(transport: FakeTransport([.http(200, body: body)]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к и наушники 55$")
        await queue.flush()

        let expected = try CaptureReplyBodies.reply(body)
        #expect(try harness.store.load().captures.first?.reply == expected)
        #expect(await harness.makeQueue().state().captures.first?.reply == expected)
    }

    @Test("файл очереди до FT-255: ответ без записей читается, записанная остаётся записанной")
    func readsFileBeforeRecords() throws {
        let harness = try QueueHarness()
        let older = """
            {"captures":[{"attempts":1,"capturedAt":815000000,"clientId":"3903229C-4ACB-4547-8620-13DC3B9FAA9E",\
            "reply":{"status":"needs_review","summary":"Перевел · 500 000 сум","title":"Нужно проверить"},\
            "state":"sent","text":"перевел 500к","timeZoneIdentifier":"Asia/Tashkent"}],"tokenRefused":false}
            """
        try Data(older.utf8).write(to: harness.store.fileURL)

        let capture = try #require(try harness.store.load().captures.first)

        #expect(capture.state == .sent)
        #expect(capture.reply == CaptureReply(
            status: "needs_review", title: "Нужно проверить", summary: "Перевел · 500 000 сум"
        ))
        #expect(capture.reply?.records == [])
        #expect(capture.reply?.withoutAmount == [])
        #expect(capture.reply?.repeated == false)
    }
}
