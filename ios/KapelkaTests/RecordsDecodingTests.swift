import Foundation
import Testing
@testable import Kapelka

/// The answers of `docs/pastel/api.md` the records client reads: the history page (FT-107), the categories (FT-099),
/// a record after restore or edit (FT-105).
@Suite("Записи и категории из ответа сервера")
struct RecordsDecodingTests {
    @Test("страница истории из api.md: записи, nextCursor; summary не мешает")
    func historyPageFromDocs() async throws {
        let transport = FakeTransport([.http(200, body: RecordsReply.page(
            [
                RecordsReply.record(),
                RecordsReply.record(
                    id: "b2", date: "2026-10-28", createdAt: "2026-10-28T05:00:00.000Z", type: "income",
                    amountMinor: 120_050, currency: "USD", categoryId: "cat-salary", category: "Зарплата",
                    description: "", merchant: "Acme LLC", needsReview: true
                ),
            ],
            nextCursor: "WyIyMDI2LTEwLTE2Iiwi",
            summary: #"{"count":2,"netMinor":-10900000,"usd":{"present":false,"missingRate":false}}"#
        ))])
        let page = try await client(transport).page()

        #expect(page.nextCursor == "WyIyMDI2LTEwLTE2Iiwi")
        #expect(page.items == [
            Record(
                id: "3f1c0d2e-7a4b-4c55-9d8e-2a6f1b3c4d5e", date: "2026-10-29", type: .expense, amountMinor: 2_500_000,
                currency: "UZS", categoryId: "cat-cafe", category: "Кафе", categoryColor: "rose", accountId: "acc-card",
                description: "кофе", merchant: nil, needsReview: false, source: "ios_shortcut",
                createdAt: "2026-10-29T09:32:05.000Z"
            ),
            Record(
                id: "b2", date: "2026-10-28", type: .income, amountMinor: 120_050, currency: "USD",
                categoryId: "cat-salary", category: "Зарплата", categoryColor: "rose", accountId: "acc-card",
                description: "", merchant: "Acme LLC", needsReview: true, source: "ios_shortcut",
                createdAt: "2026-10-28T05:00:00.000Z"
            ),
        ])
    }

    @Test("последняя страница — nextCursor null")
    func lastPage() async throws {
        let transport = FakeTransport([.http(200, body: RecordsReply.page([RecordsReply.record()]))])
        let page = try await client(transport).page()
        #expect(page.nextCursor == nil)
        #expect(page.items.count == 1)
    }

    @Test("старая запись без валюты, категории и счёта читается: сумы, пустые поля")
    func olderRecord() throws {
        let json = """
            {"id":"old","amountMinor":1800000,"amount":18000,"type":"expense","description":"такси",\
            "date":"2026-10-14T05:30:00.000Z","userId":"u","category":"Транспорт"}
            """
        let record = try JSONDecoder().decode(Record.self, from: Data(json.utf8))

        #expect(record.currency == "UZS")
        #expect(record.categoryId == nil)
        #expect(record.accountId == nil)
        #expect(record.merchant == nil)
        #expect(record.needsReview == false)
        #expect(record.createdAt == nil)
        #expect(record.date == "2026-10-14T05:30:00.000Z")
    }

    @Test("запись, которую телефон не прочёл, пропущена — остальные на месте")
    func unreadableRecordSkipped() async throws {
        let transport = FakeTransport([.http(200, body: RecordsReply.page(
            [
                RecordsReply.record(id: "a"),
                #"{"id":"broken","type":"transfer","amountMinor":100,"date":"2026-10-29"}"#,
                "null",
                #"{"id":"no-amount","type":"expense","date":"2026-10-29"}"#,
                RecordsReply.record(id: "b"),
            ],
            nextCursor: "next"
        ))])
        let page = try await client(transport).page()

        #expect(page.items.map(\.id) == ["a", "b"])
        #expect(page.nextCursor == "next")
    }

    @Test("категории из api.md: id, тип, название, скрыта ли")
    func categoriesFromDocs() async throws {
        let transport = FakeTransport([.http(200, body: RecordsReply.categories([
            RecordsReply.category(),
            RecordsReply.category(id: "cat-gifts", name: "Подарки", isHidden: true),
            RecordsReply.category(id: "cat-salary", type: "income", name: "Зарплата"),
        ]))])
        let categories = try await client(transport).categories()

        #expect(categories == [
            RecordCategory(id: "cat-cafe", type: .expense, name: "Кафе", isHidden: false),
            RecordCategory(id: "cat-gifts", type: .expense, name: "Подарки", isHidden: true),
            RecordCategory(id: "cat-salary", type: .income, name: "Зарплата", isHidden: false),
        ])
    }

    @Test("запись после «Вернуть» и смены категории — целиком, с ответа сервера")
    func recordAfterRestoreAndEdit() async throws {
        let edited = RecordsReply.record(categoryId: "cat-food", category: "Продукты")
        let transport = FakeTransport([
            .http(200, body: RecordsReply.one(RecordsReply.record())),
            .http(200, body: RecordsReply.one(edited, message: "Transaction updated successfully")),
        ])
        let client = client(transport)

        #expect(try await client.restore("3f1c0d2e-7a4b-4c55-9d8e-2a6f1b3c4d5e").category == "Кафе")
        let changed = try await client.setCategory("cat-food", of: "3f1c0d2e-7a4b-4c55-9d8e-2a6f1b3c4d5e")
        #expect(changed.categoryId == "cat-food")
        #expect(changed.category == "Продукты")
    }

    @Test("запись на диске читается так же, как с сервера")
    func cacheRoundTrip() throws {
        let record = try JSONDecoder().decode(Record.self, from: Data(RecordsReply.record(merchant: "Korzinka").utf8))
        let page = RecordsPage(items: [record], nextCursor: "next")

        let decoded = try JSONDecoder().decode(RecordsPage.self, from: try JSONEncoder().encode(page))
        #expect(decoded == page)
    }

    private func client(_ transport: FakeTransport) -> RecordsClient {
        let settings = TestSettings()
        return RecordsClient(configuration: { settings.configuration }, transport: transport)
    }
}
