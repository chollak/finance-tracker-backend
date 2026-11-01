import Foundation
import Testing
@testable import Kapelka

/// «Удалить» on the card of «Записать» (FT-252) deletes every record of the phrase through «Записи»' own list, so
/// «Записи» hide them too; one bar «Удалено N · Вернуть» brings them all back. Without a network and on 404 — as the
/// swipe of FT-221. The list tells what the server deleted and gave back (`RecordsChange`), for the card.
@MainActor
@Suite("Записи: удалить все записи фразы")
struct RecordsPhraseDeleteTests {
    private static let bread = RecordsReply.record(
        id: "bread", date: "2026-10-29", createdAt: "2026-10-29T12:00:00.000Z", description: "хлеб"
    )
    private static let milk = RecordsReply.record(
        id: "milk", date: "2026-10-29", createdAt: "2026-10-29T11:59:00.000Z", description: "молоко"
    )
    private static let lunch = RecordsReply.record(
        id: "lunch", date: "2026-10-28", createdAt: "2026-10-28T20:00:00.000Z", description: "обед"
    )
    private static let phrase = [
        RecordsNotice.Item(id: "bread", title: "хлеб"),
        RecordsNotice.Item(id: "milk", title: "молоко"),
    ]

    private let timer = ManualTimer()

    private func list(_ routes: RoutedTransport) throws -> (RecordsList, Changes) {
        let harness = try RecordsHarness(routes: routes)
        let clock = harness.clock
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        let timer = timer
        let list = RecordsList(
            feed: harness.makeFeed(),
            now: { clock.now },
            calendar: calendar,
            wait: { await timer.wait($0) }
        )
        let changes = Changes()
        list.changed = { changes.all.append($0) }
        return (list, changes)
    }

    private func ids(_ list: RecordsList) -> [String] {
        list.days.flatMap(\.rows).map(\.id)
    }

    private func sent(_ routes: RoutedTransport) async -> [String] {
        await routes.recordEdits.requests.map { "\($0.httpMethod ?? "") \($0.url?.path() ?? "")" }
    }

    private static let firstPage = FakeTransport.Reply.http(200, body: RecordsReply.page([bread, milk, lunch]))

    @Test("удаляет каждую запись фразы; плашка «Удалено 2 · Вернуть», «Вернуть» возвращает обе")
    func deleteAndRestoreAll() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [
                .http(200, body: RecordsReply.deleted("bread")),
                .http(200, body: RecordsReply.deleted("milk")),
                .http(200, body: RecordsReply.one(Self.bread)),
                .http(200, body: RecordsReply.one(Self.milk)),
            ]
        )
        let (list, changes) = try list(routes)
        await list.refresh()

        await list.delete(Self.phrase)

        #expect(ids(list) == ["lunch"])
        #expect(list.notice?.text == "Удалено 2")
        #expect(list.notice?.restorable == ["bread", "milk"])
        #expect(changes.all == [.deleted(["bread", "milk"])])

        await list.restoreDeleted()

        #expect(ids(list) == ["bread", "milk", "lunch"])
        #expect(list.notice == nil)
        #expect(changes.all == [.deleted(["bread", "milk"]), .restored(["bread", "milk"])])
        #expect(await sent(routes) == [
            "DELETE /api/transactions/bread",
            "DELETE /api/transactions/milk",
            "POST /api/transactions/bread/restore",
            "POST /api/transactions/milk/restore",
        ])
    }

    @Test("«Записи» ещё не открывались — записи удаляются всё равно, и потом их там нет")
    func deleteBeforeTheTabOpened() async throws {
        let routes = RoutedTransport(
            page: [.http(200, body: RecordsReply.page([Self.lunch]))],
            edits: [.http(200, body: RecordsReply.deleted("bread")), .http(200, body: RecordsReply.deleted("milk"))]
        )
        let (list, changes) = try list(routes)

        await list.delete(Self.phrase)

        #expect(list.notice?.restorable == ["bread", "milk"])
        #expect(changes.all == [.deleted(["bread", "milk"])])
        await list.refresh()
        #expect(ids(list) == ["lunch"])
    }

    @Test("одна не удалилась без связи — она на месте и названа; «Вернуть» — для удалённой")
    func partlyOffline() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [.http(200, body: RecordsReply.deleted("bread")), .failure(.notConnectedToInternet)]
        )
        let (list, changes) = try list(routes)
        await list.refresh()

        await list.delete(Self.phrase)

        #expect(ids(list) == ["milk", "lunch"])
        #expect(list.notice?.message == "Не удалил «молоко» — нет связи")
        #expect(list.notice?.restorable == ["bread"])
        #expect(changes.all == [.deleted(["bread"])])
    }

    @Test("без связи — ничего не меняется, «Нет связи — попробуй позже», как свайп")
    func offline() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [.failure(.notConnectedToInternet), .failure(.notConnectedToInternet)]
        )
        let (list, changes) = try list(routes)
        await list.refresh()

        await list.delete(Self.phrase)

        #expect(ids(list) == ["bread", "milk", "lunch"])
        #expect(list.notice?.text == "Нет связи — попробуй позже")
        #expect(list.notice?.restorable == [])
        #expect(changes.all.isEmpty)
    }

    @Test("уже удалена где-то ещё (404) — её нет, «Запись уже удалена», и это тоже удаление")
    func goneElsewhere() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage, .http(200, body: RecordsReply.page([Self.milk, Self.lunch]))],
            edits: [.http(404, body: RecordsReply.recordNotFound("bread")), .http(200, body: RecordsReply.deleted("milk"))]
        )
        let (list, changes) = try list(routes)
        await list.refresh()

        await list.delete(Self.phrase)

        #expect(ids(list) == ["lunch"])
        #expect(list.notice?.message == "Запись уже удалена")
        #expect(list.notice?.restorable == ["milk"])
        #expect(changes.all == [.deleted(["bread", "milk"])])
    }

    @Test("«Вернуть» не прошёл для одной — она названа и ждёт своего «Вернуть»")
    func restorePartlyOffline() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [
                .http(200, body: RecordsReply.deleted("bread")),
                .http(200, body: RecordsReply.deleted("milk")),
                .http(200, body: RecordsReply.one(Self.bread)),
                .failure(.timedOut),
                .http(200, body: RecordsReply.one(Self.milk)),
            ]
        )
        let (list, changes) = try list(routes)
        await list.refresh()
        await list.delete(Self.phrase)

        await list.restoreDeleted()
        #expect(ids(list) == ["bread", "lunch"])
        #expect(list.notice?.message == "Не вернул «молоко» — нет связи")
        #expect(list.notice?.text == "Не вернул «молоко» — нет связи. Удалено")
        #expect(list.notice?.restorable == ["milk"])

        await list.restoreDeleted()
        #expect(ids(list) == ["bread", "milk", "lunch"])
        #expect(changes.all == [.deleted(["bread", "milk"]), .restored(["bread"]), .restored(["milk"])])
    }

    @Test("«Вернуть» не прошёл ни для одной — «Не вернул 2 записи — нет связи»")
    func restoreOffline() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [
                .http(200, body: RecordsReply.deleted("bread")),
                .http(200, body: RecordsReply.deleted("milk")),
                .failure(.notConnectedToInternet),
                .failure(.notConnectedToInternet),
            ]
        )
        let (list, _) = try list(routes)
        await list.refresh()
        await list.delete(Self.phrase)

        await list.restoreDeleted()

        #expect(ids(list) == ["lunch"])
        #expect(list.notice?.message == "Не вернул 2 записи — нет связи")
        #expect(list.notice?.restorable == ["bread", "milk"])
    }

    @Test("свайп и смена категории удалённой где-то записи — тоже удаление для карточки")
    func swipeAndGoneEditTellTheCard() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage, .http(200, body: RecordsReply.page([Self.lunch]))],
            edits: [.http(200, body: RecordsReply.deleted("bread")), .http(404, body: RecordsReply.recordNotFound("milk"))]
        )
        let (list, changes) = try list(routes)
        await list.refresh()

        await list.delete("bread")
        await #expect(throws: RecordsFailure.recordGone) { try await list.setCategory("cat-food", of: "milk") }

        #expect(changes.all == [.deleted(["bread"]), .deleted(["milk"])])
    }
}

/// What the list told, in order.
@MainActor
private final class Changes {
    var all: [RecordsChange] = []
}
