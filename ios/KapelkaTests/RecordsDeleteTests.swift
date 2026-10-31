import Foundation
import Testing
@testable import Kapelka

/// The swipe on «Записи» (FT-221): the row goes at once and the server deletes it; «Удалено · Вернуть» for 5 s brings
/// it back to its place. A delete while the bar is up takes the bar over. Without a network nothing changes; a record
/// deleted elsewhere (404) leaves the list, which refreshes.
@MainActor
@Suite("Записи: удалить и вернуть")
struct RecordsDeleteTests {
    /// Newest first, as the server sorts.
    private static let c = RecordsReply.record(id: "c", date: "2026-10-29", createdAt: "2026-10-29T12:00:00.000Z")
    private static let b = RecordsReply.record(id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z")
    private static let a = RecordsReply.record(id: "a", date: "2026-10-28", createdAt: "2026-10-28T20:00:00.000Z")

    private let timer = ManualTimer()

    private func page(_ records: [String], next: String? = nil) -> FakeTransport.Reply {
        .http(200, body: RecordsReply.page(records, nextCursor: next))
    }

    private func list(_ routes: RoutedTransport) throws -> RecordsList {
        try make(routes).list
    }

    /// The list and its harness, for a look at the page on disk.
    private func make(_ routes: RoutedTransport) throws -> (list: RecordsList, harness: RecordsHarness) {
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
        return (list, harness)
    }

    private func ids(_ list: RecordsList) -> [String] {
        list.days.flatMap(\.rows).map(\.id)
    }

    private func sent(_ routes: RoutedTransport) async -> [String] {
        await routes.recordEdits.requests.map { "\($0.httpMethod ?? "") \($0.url?.path() ?? "")" }
    }

    @Test("свайп: строка уходит сразу, сервер удаляет; «Вернуть» возвращает её на место")
    func deleteAndRestore() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c, Self.b, Self.a])],
            edits: [.after(.milliseconds(200), .http(200, body: RecordsReply.deleted("b"))), .http(200, body: RecordsReply.one(Self.b))]
        )
        let list = try list(routes)
        await list.refresh()

        async let deleting: Void = list.delete("b")
        // Gone before the server answers
        #expect(await eventually { @MainActor in self.ids(list) == ["c", "a"] })
        #expect(list.notice == nil)
        await deleting

        #expect(ids(list) == ["c", "a"])
        #expect(list.notice?.text == "Удалено")
        #expect(list.notice?.restorable == "b")
        #expect(await eventually { timer.durations == [.seconds(5)] })

        await list.restoreDeleted()

        #expect(ids(list) == ["c", "b", "a"])
        #expect(list.notice == nil)
        #expect(await sent(routes) == ["DELETE /api/transactions/b", "POST /api/transactions/b/restore"])
    }

    @Test("после 5 с плашки нет, и «Вернуть» ничего не шлёт")
    func undoEndsAfterFiveSeconds() async throws {
        let routes = RoutedTransport(page: [page([Self.c, Self.b, Self.a])], edits: [.http(200, body: RecordsReply.deleted("b"))])
        let list = try list(routes)
        await list.refresh()
        await list.delete("b")
        #expect(list.notice?.restorable == "b")

        #expect(await eventually { timer.durations.count == 1 })
        timer.fire()
        #expect(await eventually { @MainActor in list.notice == nil })

        await list.restoreDeleted()
        #expect(ids(list) == ["c", "a"])
        #expect(await sent(routes) == ["DELETE /api/transactions/b"])
    }

    @Test("второе удаление при видимой плашке — «Вернуть» относится к нему, первое остаётся удалённым")
    func secondDeleteTakesTheBar() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c, Self.b, Self.a])],
            edits: [
                .http(200, body: RecordsReply.deleted("c")),
                .http(200, body: RecordsReply.deleted("a")),
                .http(200, body: RecordsReply.one(Self.a)),
            ]
        )
        let list = try list(routes)
        await list.refresh()
        await list.delete("c")
        #expect(list.notice?.restorable == "c")

        await list.delete("a")
        #expect(list.notice?.restorable == "a")
        #expect(ids(list) == ["b"])
        // The first bar's 5 s end: the second bar stays
        #expect(await eventually { timer.durations.count == 2 })
        timer.fireOldest()
        try await Task.sleep(for: .milliseconds(50))
        #expect(list.notice?.restorable == "a")

        await list.restoreDeleted()

        #expect(ids(list) == ["b", "a"])
        #expect(await sent(routes) == [
            "DELETE /api/transactions/c",
            "DELETE /api/transactions/a",
            "POST /api/transactions/a/restore",
        ])
    }

    @Test("без связи удаление ничего не меняет: строка на месте, «Нет связи — попробуй позже»")
    func deleteOffline() async throws {
        let routes = RoutedTransport(page: [page([Self.c, Self.b, Self.a])], edits: [.failure(.notConnectedToInternet)])
        let list = try list(routes)
        await list.refresh()

        await list.delete("b")

        #expect(ids(list) == ["c", "b", "a"])
        #expect(list.notice?.text == "Нет связи — попробуй позже")
        #expect(list.notice?.restorable == nil)
    }

    @Test("запись уже удалена где-то ещё (404) — строки нет, «Запись уже удалена», список обновляется")
    func deleteGone() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c, Self.b, Self.a]), page([Self.c, Self.a])],
            edits: [.http(404, body: RecordsReply.recordNotFound("b"))]
        )
        let list = try list(routes)
        await list.refresh()

        await list.delete("b")

        #expect(ids(list) == ["c", "a"])
        #expect(list.notice?.text == "Запись уже удалена")
        #expect(list.notice?.restorable == nil)
        #expect(await eventually { await routes.pages.requests.count == 2 })
    }

    @Test("«Вернуть» без связи — запись остаётся удалённой, плашка снова с «Вернуть»")
    func restoreOffline() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c, Self.b, Self.a])],
            edits: [
                .http(200, body: RecordsReply.deleted("b")),
                .failure(.timedOut),
                .http(200, body: RecordsReply.one(Self.b)),
            ]
        )
        let list = try list(routes)
        await list.refresh()
        await list.delete("b")

        await list.restoreDeleted()
        #expect(ids(list) == ["c", "a"])
        #expect(list.notice?.text == "Нет связи — попробуй позже")
        #expect(list.notice?.restorable == "b")

        await list.restoreDeleted()
        #expect(ids(list) == ["c", "b", "a"])
    }

    @Test("удалить и вернуть в прокрученных страницах — и там запись уходит и встаёт на своё место")
    func scrolledPages() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c], next: "cursor-1"), page([Self.b, Self.a])],
            edits: [
                .http(200, body: RecordsReply.deleted("b")),
                .http(200, body: RecordsReply.one(Self.b)),
                .http(200, body: RecordsReply.deleted("a")),
                .http(200, body: RecordsReply.one(Self.a)),
            ]
        )
        let list = try list(routes)
        await list.refresh()
        await list.loadMore()
        #expect(list.record(id: "a")?.date == "2026-10-28")

        await list.delete("b")
        #expect(ids(list) == ["c", "a"])
        await list.restoreDeleted()
        #expect(ids(list) == ["c", "b", "a"])

        await list.delete("a")
        #expect(ids(list) == ["c", "b"])
        await list.restoreDeleted()
        #expect(ids(list) == ["c", "b", "a"])
    }

    @Test("следующая страница, пришедшая во время удаления, удалённую запись не возвращает")
    func nextPageDuringDelete() async throws {
        let routes = RoutedTransport(
            page: [
                page([Self.c, Self.b], next: "cursor-1"),
                // Read before the delete: b's day was changed in the Mini App, and it came again
                .after(.milliseconds(300), page([Self.b, Self.a])),
            ],
            edits: [.http(200, body: RecordsReply.deleted("b"))]
        )
        let list = try list(routes)
        await list.refresh()

        async let more: Void = list.loadMore()
        #expect(await eventually { await routes.pages.requests.count == 2 })
        await list.delete("b")
        await more

        #expect(ids(list) == ["c", "a"])
        #expect(list.record(id: "b") == nil)
    }

    @Test("обновление, пока удаление в пути, строку не возвращает; не удалилось — строка снова на месте")
    func refreshDuringDelete() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c, Self.b, Self.a]), page([Self.c, Self.b, Self.a])],
            edits: [.after(.milliseconds(300), .failure(.networkConnectionLost))]
        )
        let list = try list(routes)
        await list.refresh()

        async let deleting: Void = list.delete("b")
        #expect(await eventually { await routes.recordEdits.requests.count == 1 })
        await list.refresh()
        #expect(ids(list) == ["c", "a"])

        await deleting
        #expect(ids(list) == ["c", "b", "a"])
        #expect(list.notice?.text == "Нет связи — попробуй позже")
    }

    @Test("«Вернуть» последней загруженной строки, пока следующая страница в пути, — строка снова в конце, и на диске")
    func restoreLastLoadedRow() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c, Self.b], next: "cursor-1"), .after(.milliseconds(300), page([Self.a]))],
            edits: [.http(200, body: RecordsReply.deleted("b")), .http(200, body: RecordsReply.one(Self.b))]
        )
        let (list, harness) = try make(routes)
        await list.refresh()

        async let more: Void = list.loadMore()
        #expect(await eventually { await routes.pages.requests.count == 2 })
        await list.delete("b")
        await list.restoreDeleted()

        // The next page goes on after b: b must come back here, no page will bring it again
        #expect(ids(list) == ["c", "b"])
        #expect(harness.cache.load()?.page.items.map(\.id) == ["c", "b"])
        await more
        #expect(ids(list) == ["c", "b", "a"])
    }

    @Test("«Вернуть» последней строки, когда следующая страница не пришла, — строка на месте, «Загрузить ещё» приносит дальше")
    func restoreLastRowAfterFailedPage() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c, Self.b], next: "cursor-1"), .failure(.timedOut), page([Self.a])],
            edits: [.http(200, body: RecordsReply.deleted("b")), .http(200, body: RecordsReply.one(Self.b))]
        )
        let list = try list(routes)
        await list.refresh()
        await list.loadMore()
        #expect(list.moreProblem == .unreachable)

        await list.delete("b")
        await list.restoreDeleted()
        #expect(ids(list) == ["c", "b"])

        await list.loadMore()
        #expect(ids(list) == ["c", "b", "a"])
    }

    @Test("вернули запись, которой нет среди загруженных — список начат заново, — а дальше есть страницы: список обновляется")
    func restoreWithoutPlaceRefreshes() async throws {
        let routes = RoutedTransport(
            page: [page([Self.c, Self.b], next: "cursor-1"), page([Self.c], next: "cursor-2"), page([Self.c, Self.b], next: "cursor-1")],
            edits: [.http(200, body: RecordsReply.deleted("b")), .http(200, body: RecordsReply.one(Self.b))]
        )
        let list = try list(routes)
        await list.refresh()
        await list.delete("b")
        await list.refresh()

        await list.restoreDeleted()

        #expect(await eventually { await routes.pages.requests.count == 3 })
        #expect(await eventually { @MainActor in self.ids(list) == ["c", "b"] })
    }
}
