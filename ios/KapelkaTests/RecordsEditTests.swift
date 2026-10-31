import Foundation
import Testing
@testable import Kapelka

/// Delete, restore and category change through the feed: the server decides, the page on disk follows its answer, so
/// the list without a network never shows a deleted record or the old category (FT-219, FT-221).
@Suite("Записи: удалить, вернуть, сменить категорию")
struct RecordsEditTests {
    /// Newest first, as the server sorts: by day, then by the moment of creation, then by id.
    private let first = RecordsReply.record(id: "c", date: "2026-10-29", createdAt: "2026-10-29T12:00:00.000Z")
    private let second = RecordsReply.record(id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z")
    private let third = RecordsReply.record(id: "a", date: "2026-10-28", createdAt: "2026-10-28T20:00:00.000Z")

    @Test("удалить — запись пропадает и из кэша")
    func deleteRemovesFromCache() async throws {
        let harness = try primed([.http(200, body: RecordsReply.deleted("b"))])
        let feed = harness.makeFeed()

        try await feed.delete("b")

        #expect(cachedIds(harness) == ["c", "a"])
        let request = try #require(await harness.transport.requests.last)
        #expect(request.httpMethod == "DELETE")
    }

    @Test("удалить без связи — ничего не меняется: в очередь правка не идёт")
    func deleteOfflineChangesNothing() async throws {
        let harness = try primed([.failure(.notConnectedToInternet)])
        let feed = harness.makeFeed()

        await #expect(throws: RecordsFailure.unreachable) { try await feed.delete("b") }

        #expect(cachedIds(harness) == ["c", "b", "a"])
        harness.clock.advance(by: 60)
        _ = await feed.refresh()
        #expect(await harness.transport.requests.filter { $0.httpMethod == "DELETE" }.count == 1)
    }

    @Test("удалить уже удалённую (404) — строки нет и в кэше")
    func deleteGoneRemovesFromCache() async throws {
        let harness = try primed([.http(404, body: RecordsReply.recordNotFound("b"))])
        let feed = harness.makeFeed()

        await #expect(throws: RecordsFailure.recordGone) { try await feed.delete("b") }

        #expect(cachedIds(harness) == ["c", "a"])
    }

    @Test("вернуть — запись снова в кэше на своём месте")
    func restoreBackInPlace() async throws {
        let harness = try primed([
            .http(200, body: RecordsReply.deleted("b")),
            .http(200, body: RecordsReply.one(second)),
        ])
        let feed = harness.makeFeed()
        try await feed.delete("b")

        let restored = try await feed.restore("b")

        #expect(restored.id == "b")
        #expect(cachedIds(harness) == ["c", "b", "a"])
    }

    @Test("вернуть запись старше последней на странице, когда дальше есть страницы, — она там, а не в кэше")
    func restoreOlderThanFirstPage() async throws {
        let older = RecordsReply.record(id: "z", date: "2026-10-01", createdAt: "2026-10-01T10:00:00.000Z")
        let harness = try primed([.http(200, body: RecordsReply.one(older))], nextCursor: "next")
        let feed = harness.makeFeed()

        _ = try await feed.restore("z")

        #expect(cachedIds(harness) == ["c", "b", "a"])
    }

    @Test("вернуть последнюю запись страницы, когда дальше есть страницы, — она снова в кэше: курсор уже за ней")
    func restoreLastOfPage() async throws {
        let harness = try primed(
            [.http(200, body: RecordsReply.deleted("a")), .http(200, body: RecordsReply.one(third))],
            nextCursor: "next"
        )
        let feed = harness.makeFeed()
        try await feed.delete("a")
        #expect(cachedIds(harness) == ["c", "b"])

        _ = try await feed.restore("a")

        #expect(cachedIds(harness) == ["c", "b", "a"])
    }

    @Test("вернуть самую старую на последней странице — она в конце кэша")
    func restoreOldestOnLastPage() async throws {
        let older = RecordsReply.record(id: "z", date: "2026-10-01", createdAt: "2026-10-01T10:00:00.000Z")
        let harness = try primed([.http(200, body: RecordsReply.one(older))])
        let feed = harness.makeFeed()

        _ = try await feed.restore("z")

        #expect(cachedIds(harness) == ["c", "b", "a", "z"])
    }

    @Test("сменить категорию — запись в кэше берёт ответ сервера")
    func setCategoryTakesServerAnswer() async throws {
        let edited = RecordsReply.record(
            id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z", categoryId: "cat-food", category: "Продукты"
        )
        let harness = try primed([.http(200, body: RecordsReply.one(edited))])
        let feed = harness.makeFeed()

        let changed = try await feed.setCategory("cat-food", of: "b")

        #expect(changed.category == "Продукты")
        let saved = try #require(harness.cache.load())
        #expect(saved.page.items.map(\.id) == ["c", "b", "a"])
        #expect(saved.page.items[1] == changed)
    }

    @Test("сменить категорию у удалённой (404) — строки нет в кэше; без связи — кэш прежний")
    func setCategoryFailures() async throws {
        let harness = try primed([
            .http(503, body: ""),
            .http(404, body: RecordsReply.recordNotFound("b")),
        ])
        let feed = harness.makeFeed()

        await #expect(throws: RecordsFailure.unreachable) { try await feed.setCategory("cat-food", of: "b") }
        #expect(cachedIds(harness) == ["c", "b", "a"])

        await #expect(throws: RecordsFailure.recordGone) { try await feed.setCategory("cat-food", of: "b") }
        #expect(cachedIds(harness) == ["c", "a"])
    }

    @Test("категории больше нет (404) — запись в кэше остаётся")
    func categoryGoneKeepsRecord() async throws {
        let harness = try primed([.http(404, body: RecordsReply.categoryNotFound("cat-x"))])
        let feed = harness.makeFeed()

        await #expect(throws: RecordsFailure.categoryGone) { try await feed.setCategory("cat-x", of: "b") }

        #expect(cachedIds(harness) == ["c", "b", "a"])
    }

    @Test("удаление, пока обновление в пути: страница, прочитанная до удаления, не возвращает запись")
    func deleteDuringRefresh() async throws {
        let transport = FakeTransport([
            .after(.milliseconds(300), .http(200, body: RecordsReply.page([first, second, third]))),
            .http(200, body: RecordsReply.deleted("b")),
        ])
        let harness = try RecordsHarness(transport: transport)
        let feed = harness.makeFeed()

        async let refreshed = feed.refresh()
        #expect(await eventually { await transport.requests.count == 1 })
        try await feed.delete("b")
        let result = await refreshed

        guard case let .fresh(snapshot) = result else {
            Issue.record("the server answered")
            return
        }
        #expect(snapshot.page.items.map(\.id) == ["c", "a"])
        #expect(cachedIds(harness) == ["c", "a"])
    }

    @Test("смена категории, пока обновление в пути: в странице и кэше — новая категория")
    func editDuringRefresh() async throws {
        let edited = RecordsReply.record(
            id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z", categoryId: "cat-food", category: "Продукты"
        )
        let transport = FakeTransport([
            .after(.milliseconds(300), .http(200, body: RecordsReply.page([first, second, third]))),
            .http(200, body: RecordsReply.one(edited)),
        ])
        let harness = try RecordsHarness(transport: transport)
        let feed = harness.makeFeed()

        async let refreshed = feed.refresh()
        #expect(await eventually { await transport.requests.count == 1 })
        _ = try await feed.setCategory("cat-food", of: "b")
        let result = await refreshed

        guard case let .fresh(snapshot) = result else {
            Issue.record("the server answered")
            return
        }
        #expect(snapshot.page.items.map(\.category) == ["Кафе", "Продукты", "Кафе"])
        #expect(harness.cache.load()?.page.items.map(\.category) == ["Кафе", "Продукты", "Кафе"])
    }

    @Test("правка без кэша кэш не создаёт")
    func editWithoutCache() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.deleted("b"))]))
        try await harness.makeFeed().delete("b")
        #expect(harness.cache.load() == nil)
    }

    /// A feed whose disk already holds the page c, b, a; then `replies` in order.
    private func primed(_ replies: [FakeTransport.Reply], nextCursor: String? = nil) throws -> RecordsHarness {
        let harness = try RecordsHarness(transport: FakeTransport(replies))
        let page = try JSONDecoder().decode(
            Envelope.self,
            from: Data(RecordsReply.page([first, second, third], nextCursor: nextCursor).utf8)
        ).data
        try harness.cache.save(RecordsSnapshot(
            address: TestSettings.address.absoluteString,
            page: page,
            updatedAt: harness.clock.now
        ))
        return harness
    }

    private func cachedIds(_ harness: RecordsHarness) -> [String]? {
        harness.cache.load()?.page.items.map(\.id)
    }

    private struct Envelope: Decodable {
        let data: RecordsPage
    }
}
