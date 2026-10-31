import Foundation
import Testing
@testable import Kapelka

/// The first page and the moment it was read lie next to the queue (`Application Support/Kapelka/`), so the list
/// opens without a network (FT-219). Edits go to the server only: never into the queue (decision 2026-10-31), and
/// the page on disk follows what the server answered.
@Suite("Записи: кэш первой страницы")
struct RecordsCacheTests {
    private let address = TestSettings.address.absoluteString

    @Test("первая страница и время обновления на диске; без сети после перезапуска — они же, с «нет связи»")
    func firstPageSurvivesRestartOffline() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([
            .http(200, body: RecordsReply.page([RecordsReply.record(id: "a"), RecordsReply.record(id: "b")], nextCursor: "next")),
            .failure(.notConnectedToInternet),
        ]))
        let refreshedAt = harness.clock.now
        guard case let .fresh(fresh) = await harness.makeFeed().refresh() else {
            Issue.record("the server answered")
            return
        }
        #expect(fresh.page.items.map(\.id) == ["a", "b"])
        #expect(fresh.updatedAt == refreshedAt)

        harness.clock.advance(by: 3600)
        let restarted = harness.makeFeed()
        #expect(await restarted.saved() == fresh)
        #expect(await harness.transport.requests.count == 1)

        let offline = await restarted.refresh()
        #expect(offline == .saved(fresh, .unreachable))
        #expect(try #require(harness.cache.load()).updatedAt == refreshedAt)
    }

    @Test("без сети и без кэша — пусто и «нет связи»")
    func offlineWithoutCache() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.failure(.timedOut)]))
        #expect(await harness.makeFeed().refresh() == .saved(nil, .unreachable))
        #expect(harness.cache.load() == nil)
    }

    @Test("5xx и неверный токен кэш не трогают: на экране прошлый список и причина")
    func failuresKeepCache() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([
            .http(200, body: RecordsReply.page([RecordsReply.record(id: "a")])),
            .http(502, body: "Bad Gateway"),
            .http(401, body: ServerReply.invalidToken),
        ]))
        let feed = harness.makeFeed()
        guard case let .fresh(fresh) = await feed.refresh() else {
            Issue.record("the server answered")
            return
        }

        #expect(await feed.refresh() == .saved(fresh, .unreachable))
        #expect(await feed.refresh() == .saved(fresh, .tokenRefused))
        #expect(harness.cache.load() == fresh)
    }

    @Test("новая страница с сервера заменяет прошлую на диске")
    func refreshReplacesCache() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([
            .http(200, body: RecordsReply.page([RecordsReply.record(id: "a")])),
            .http(200, body: RecordsReply.page([RecordsReply.record(id: "b")])),
        ]))
        let feed = harness.makeFeed()
        _ = await feed.refresh()
        harness.clock.advance(by: 60)
        _ = await feed.refresh()

        let saved = try #require(harness.cache.load())
        #expect(saved.page.items.map(\.id) == ["b"])
        #expect(saved.updatedAt == harness.clock.now)
    }

    @Test("два обновления: первое ответило позже второго — на диске и на экране страница второго")
    func olderRefreshAnsweringLastLoses() async throws {
        let transport = FakeTransport([
            .after(.milliseconds(300), .http(200, body: RecordsReply.page([RecordsReply.record(id: "a")]))),
            .http(200, body: RecordsReply.page([RecordsReply.record(id: "new"), RecordsReply.record(id: "a")])),
        ])
        let harness = try RecordsHarness(transport: transport)
        let feed = harness.makeFeed()

        async let older = feed.refresh()
        #expect(await eventually { await transport.requests.count == 1 })
        harness.clock.advance(by: 5)
        let newer = await feed.refresh()
        let olderResult = await older

        guard case let .fresh(newerSnapshot) = newer, case let .fresh(olderSnapshot) = olderResult else {
            Issue.record("the server answered both")
            return
        }
        #expect(newerSnapshot.page.items.map(\.id) == ["new", "a"])
        #expect(olderSnapshot == newerSnapshot)
        #expect(harness.cache.load() == newerSnapshot)
    }

    @Test("новое обновление не ответило — страница старого, пришедшая позже, сохраняется")
    func olderRefreshSavedWhenNewerFailed() async throws {
        let transport = FakeTransport([
            .after(.milliseconds(300), .http(200, body: RecordsReply.page([RecordsReply.record(id: "a")]))),
            .failure(.notConnectedToInternet),
        ])
        let harness = try RecordsHarness(transport: transport)
        let feed = harness.makeFeed()

        async let older = feed.refresh()
        #expect(await eventually { await transport.requests.count == 1 })
        #expect(await feed.refresh() == .saved(nil, .unreachable))
        let olderResult = await older

        guard case let .fresh(snapshot) = olderResult else {
            Issue.record("the server answered")
            return
        }
        #expect(snapshot.page.items.map(\.id) == ["a"])
        #expect(harness.cache.load() == snapshot)
    }

    @Test("кэш другого адреса не показывается: это записи другого сервера")
    func otherAddressNotShown() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([
            .http(200, body: RecordsReply.page([RecordsReply.record(id: "a")])),
            .failure(.notConnectedToInternet),
        ]))
        _ = await harness.makeFeed().refresh()

        harness.settings.set(ServerConfiguration(baseURL: URL(string: "https://other-pc.example-tailnet.ts.net")!, token: TestSettings.token))
        let feed = harness.makeFeed()
        #expect(await feed.saved() == nil)
        #expect(await feed.refresh() == .saved(nil, .unreachable))
    }

    @Test("без настроек — ни запроса, ни кэша: экран с кнопкой «Настройки»")
    func notConfigured() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.page([RecordsReply.record()]))]))
        _ = await harness.makeFeed().refresh()
        harness.settings.set(nil)

        let feed = harness.makeFeed()
        #expect(await feed.saved() == nil)
        #expect(await feed.refresh() == .saved(nil, .notConfigured))
        #expect(await harness.transport.requests.count == 1)
    }

    @Test("файл кэша, который не читается, — как его нет")
    func unreadableCache() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        try Data("{not json".utf8).write(to: harness.cache.fileURL)

        let feed = harness.makeFeed()
        #expect(await feed.saved() == nil)
        #expect(await feed.refresh() == .saved(nil, .unreachable))
    }

    @Test("папки ещё нет — первый ответ создаёт её; токена в файле нет")
    func createsFolderWithoutToken() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.page([RecordsReply.record()]))]))
        let folder = harness.cache.fileURL.deletingLastPathComponent().appending(path: "Kapelka", directoryHint: .isDirectory)
        let cache = RecordsCacheFile(fileURL: folder.appending(path: "records.json"))
        let feed = RecordsFeed(client: harness.client, cache: cache)

        _ = await feed.refresh()

        let text = String(decoding: try Data(contentsOf: cache.fileURL), as: UTF8.self)
        #expect(text.contains("Кафе"))
        #expect(!text.contains(TestSettings.token))
        #expect(cache.load()?.address == address)
    }

    @Test("кэш лежит рядом с очередью: Application Support/Kapelka/")
    func nextToQueue() {
        #expect(RecordsCacheFile.inApplicationSupport.fileURL.deletingLastPathComponent()
            == CaptureFileStore.inApplicationSupport.fileURL.deletingLastPathComponent())
        #expect(RecordsCacheFile.inApplicationSupport.fileURL.lastPathComponent == "records.json")
    }

    @Test("следующие страницы на диск не ложатся")
    func laterPagesNotCached() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([
            .http(200, body: RecordsReply.page([RecordsReply.record(id: "a")], nextCursor: "next")),
            .http(200, body: RecordsReply.page([RecordsReply.record(id: "b")])),
        ]))
        let feed = harness.makeFeed()
        _ = await feed.refresh()

        let next = try await feed.page(after: "next")
        #expect(next.items.map(\.id) == ["b"])
        #expect(harness.cache.load()?.page.items.map(\.id) == ["a"])
        #expect(harness.cache.load()?.page.nextCursor == "next")
    }
}
