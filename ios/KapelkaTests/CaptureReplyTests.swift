import Foundation
import Testing
@testable import Kapelka

/// What the queue keeps of the server's answer, record by record (FT-255): the base of the haptics, the notices, «!»
/// and the card of FT-251…FT-254.
@Suite("Ответ сервера по каждой записи")
struct CaptureReplyTests {
    @Test("оплата из QUICK_CAPTURE_API.md: id, сумма, валюта, категория, счёт, заметка, «проверить», догадки")
    func paymentFromDocs() throws {
        #expect(try CaptureReplyBodies.reply(CaptureReplyBodies.paymentFromDocs) == CaptureReply(
            status: "saved",
            title: "Записал",
            summary: "KORZINKA 24 · 25 000 сум · Продукты?",
            records: [
                CapturedRecord(
                    id: "ff1a09d9-b1d4-410a-9f8f-10f872ab580a", type: .expense, amountMinor: 2_500_000,
                    currency: "UZS", categoryId: "…", category: "Продукты", accountId: "…", accountName: "Карта",
                    description: "KORZINKA 24", needsReview: false,
                    assumptions: [.category(name: "Продукты"), .account(name: "Карта", reason: .hint)],
                    deletedAt: nil
                ),
            ]
        ))
    }

    @Test("фраза «такси 18к» из QUICK_CAPTURE_API.md: счёт по умолчанию — догадка")
    func phraseFromDocs() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.taxiFromDocs)

        #expect(reply.records == [
            CapturedRecord(
                id: "tx-1", type: .expense, amountMinor: 1_800_000, currency: "UZS", categoryId: "cat-transport",
                category: "Транспорт", accountId: "acc-1", accountName: "Карта", description: "такси",
                needsReview: false, assumptions: [.account(name: "Карта", reason: .byDefault)], deletedAt: nil
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
            id: "rec-headphones", type: .expense, amountMinor: 5500, currency: "USD", categoryId: "cat-shopping",
            category: "Покупки", accountId: "acc-card", accountName: "Карта", description: "наушники",
            needsReview: true,
            assumptions: [
                .category(name: "Покупки"),
                .account(name: "Карта", reason: .byDefault),
                .currency(code: "USD", reason: .noUsdAccount),
            ],
            deletedAt: nil
        ))
    }

    @Test("«хлеб 5к и бензин 200к» с сервера с ИИ: у каждой записи своя заметка, категория и счёт по id")
    func eachRecordItsNote() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.breadAndPetrol)

        #expect(reply.records.map(\.description) == ["хлеб", "бензин"])
        #expect(reply.records.map(\.categoryId) == [
            "3e630b99-d1dc-456b-b791-61cf21d5f46e", "19cfc603-92f8-451b-8ba1-e5868c36a8ae",
        ])
        #expect(reply.records.map(\.accountId) == [
            "3cacdec0-0136-11a2-62a2-12e4e96411cf", "3cacdec0-0136-11a2-62a2-12e4e96411cf",
        ])
    }

    @Test("без суммы: «такси» в «кофе 25к, такси» — в withoutAmount, записи под него нет")
    func withoutAmount() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffeeAndTaxiWithoutAmount)

        #expect(reply.records.map(\.id) == ["c5b63732-5ffd-455e-851d-f9eb80f3ea38"])
        #expect(reply.withoutAmount == [CapturedWithoutAmount(description: "такси", category: "Транспорт")])
    }

    @Test("повтор после потерянного ответа: без названия счёта и догадок, но с id счёта и категории")
    func repeatFromServer() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffeeRepeated)

        #expect(reply.repeated)
        #expect(reply.withoutAmount.isEmpty)
        #expect(reply.records == [
            CapturedRecord(
                id: CaptureReplyBodies.coffeeId, type: .expense, amountMinor: 4_500_000, currency: "UZS",
                categoryId: "637c7a38-2079-4094-a0dd-c40c5d36c211", category: "Кафе",
                accountId: "26da76bc-f575-46c8-74d7-8ffd3e562694", accountName: nil, description: "кофе",
                needsReview: false, assumptions: [], deletedAt: "2026-10-31T20:58:13.433Z"
            ),
        ])
    }

    @Test("повтор после удаления на сервере с ИИ: удалённая запись остаётся с deletedAt, вторая — записанной")
    func repeatAfterDeletion() throws {
        let reply = try CaptureReplyBodies.reply(CaptureReplyBodies.breadAndPetrolRepeatedAfterDeletion)

        #expect(reply.records.map(\.id) == [
            "c4b400f6-62a2-4fd0-8624-b71d7dcd23fa", "9df8b6e3-e460-4377-83cb-8c31806cf31b",
        ])
        #expect(reply.records.map(\.deletedAt) == [nil, "2026-10-31T21:31:57.397Z"])
        #expect(reply.records.map(\.isDeleted) == [false, true])
        #expect(reply.records.map(\.accountName) == [nil, nil])
        #expect(reply.records.map(\.description) == ["хлеб", "бензин"])
    }

    @Test("удалённая запись переживает файл очереди и перезапуск с той же отметкой")
    func deletionKeptOnDisk() async throws {
        let body = CaptureReplyBodies.breadAndPetrolRepeatedAfterDeletion
        let harness = try QueueHarness(transport: FakeTransport([.http(200, body: body)]))
        let queue = harness.makeQueue()
        _ = try await queue.add("хлеб 5к и бензин 200к картой")
        await queue.flush()

        let kept = try #require(await harness.makeQueue().state().captures.first?.reply)
        #expect(kept.records.map(\.isDeleted) == [false, true])
        #expect(kept == (try CaptureReplyBodies.reply(body)))
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
                id: "good", type: .expense, amountMinor: 2_500_000, currency: "UZS", categoryId: nil, category: "Кафе",
                accountId: nil, accountName: nil, description: "", needsReview: false,
                assumptions: [.category(name: "Кафе")], deletedAt: nil
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
