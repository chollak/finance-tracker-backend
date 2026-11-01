import Foundation
import Testing
@testable import Kapelka

/// The tab «Записи» against the server (FT-220): the first page and the account names on opening the tab, the next
/// page while scrolling, the copy on disk without a network. It refreshes on opening the tab, on coming back to the
/// app, on a pull and after the queue wrote a record — never on a timer.
@MainActor
@Suite("Записи: вкладка")
struct RecordsListTests {
    private static let accounts = RecordsReply.accounts([
        RecordsReply.account(id: "acc-card", name: "Карта"),
        RecordsReply.account(id: "acc-cash", name: "Наличные"),
    ])

    private func page(_ ids: [String], next: String? = nil, date: String = "2026-10-29") -> FakeTransport.Reply {
        .http(200, body: RecordsReply.page(ids.map { RecordsReply.record(id: $0, date: date) }, nextCursor: next))
    }

    private func list(_ harness: RecordsHarness) -> RecordsList {
        let clock = harness.clock
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        return RecordsList(feed: harness.makeFeed(), now: { clock.now }, calendar: calendar)
    }

    private func ids(_ list: RecordsList) -> [String] {
        list.days.flatMap(\.rows).map(\.id)
    }

    @Test("открыл вкладку — первая страница с сервера по дням, в строке имя счёта")
    func opensWithFirstPage() async throws {
        let routes = RoutedTransport(
            page: [.http(200, body: RecordsReply.page([
                RecordsReply.record(id: "a"),
                RecordsReply.record(id: "b", date: "2026-10-28", accountId: "acc-cash"),
            ]))],
            accounts: [.http(200, body: Self.accounts)]
        )
        let list = list(try RecordsHarness(routes: routes))

        await list.screenChanged(onScreen: true)

        #expect(list.screen == .list)
        #expect(list.days.map(\.title) == ["Сегодня", "Вчера"])
        #expect(list.days.flatMap(\.rows).map(\.details) == ["Кафе · Карта", "Кафе · Наличные"])
        #expect(list.caption == "Обновлено только что")
        #expect(list.hasMore == false)
    }

    @Test("следующая страница — при прокрутке, с курсором прошлой; после последней запросов нет")
    func nextPageWhileScrolling() async throws {
        let routes = RoutedTransport(
            page: [page(["a", "b"], next: "cursor-1"), page(["c"], date: "2026-10-27")],
            accounts: [.http(200, body: Self.accounts)]
        )
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()
        #expect(list.hasMore)

        await list.loadMore()
        #expect(ids(list) == ["a", "b", "c"])
        #expect(list.days.map(\.title) == ["Сегодня", "27 октября"])
        #expect(list.hasMore == false)
        let second = try #require(await routes.pages.requests.last?.url)
        #expect(second.query()?.contains("cursor=cursor-1") == true)

        await list.loadMore()
        #expect(await routes.pages.requests.count == 2)
    }

    @Test("запись, удалённая через API или в Mini App, пропадает после обновления")
    func deletedElsewhereGoesOnRefresh() async throws {
        let routes = RoutedTransport(page: [page(["a", "b"]), page(["b"])])
        let list = list(try RecordsHarness(routes: routes))

        await list.refresh()
        #expect(ids(list) == ["a", "b"])
        await list.refresh()
        #expect(ids(list) == ["b"])
    }

    @Test("обновление после прокрутки — снова первая страница; запоздавшая следующая страница не ложится")
    func refreshDropsLatePage() async throws {
        let routes = RoutedTransport(page: [
            page(["a"], next: "cursor-1"),
            .after(.milliseconds(300), page(["old"], date: "2026-10-27")),
            page(["new", "a"], next: "cursor-2"),
            page(["b"], date: "2026-10-27"),
        ])
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()

        async let late: Void = list.loadMore()
        #expect(await eventually { await routes.pages.requests.count == 2 })
        await list.refresh()
        await late
        #expect(ids(list) == ["new", "a"])

        await list.loadMore()
        #expect(ids(list) == ["new", "a", "b"])
        let last = try #require(await routes.pages.requests.last?.url)
        #expect(last.query()?.contains("cursor=cursor-2") == true)
    }

    @Test("обновление с той же первой страницей, пока следующая в пути, — конец списка новый и просит её снова")
    func sameCursorAfterRefresh() async throws {
        let routes = RoutedTransport(page: [
            page(["a"], next: "cursor-1"),
            .after(.milliseconds(300), page(["old"], date: "2026-10-27")),
            page(["a"], next: "cursor-1"),
            page(["b"], date: "2026-10-27"),
        ])
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()
        let before = try #require(list.nextPageKey)

        async let late: Void = list.loadMore()
        #expect(await eventually { await routes.pages.requests.count == 2 })
        await list.refresh()
        // The row at the list's end is a new one: on screen it asks for the page again by itself
        #expect(list.nextPageKey != before)
        await late
        #expect(ids(list) == ["a"])

        await list.loadMore()
        #expect(ids(list) == ["a", "b"])
        #expect(list.nextPageKey == nil)
    }

    @Test("следующая страница без связи — «Нет связи», строки на месте; потом догружается")
    func nextPageOffline() async throws {
        let routes = RoutedTransport(page: [page(["a"], next: "cursor-1"), .failure(.notConnectedToInternet), page(["b"])])
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()

        await list.loadMore()
        #expect(ids(list) == ["a"])
        #expect(list.moreProblem == .unreachable)
        #expect(list.hasMore)

        await list.loadMore()
        #expect(ids(list) == ["a", "b"])
        #expect(list.moreProblem == nil)
    }

    @Test("без связи после перезапуска — сразу кэш, затем «Нет связи · обновлено в 14:32»; без имён счетов")
    func offlineShowsCache() async throws {
        let routes = RoutedTransport(
            page: [page(["a", "b"]), .after(.milliseconds(300), .failure(.notConnectedToInternet))],
            accounts: [.http(200, body: Self.accounts), .failure(.notConnectedToInternet)]
        )
        let harness = try RecordsHarness(routes: routes)
        await list(harness).refresh()
        harness.clock.advance(by: 3600)

        let restarted = list(harness)
        async let refreshing: Void = restarted.refresh()
        #expect(await eventually { @MainActor in restarted.days.isEmpty == false })
        #expect(ids(restarted) == ["a", "b"])
        await refreshing

        #expect(restarted.screen == .list)
        #expect(restarted.caption == "Нет связи · обновлено в 14:32")
        #expect(restarted.days.flatMap(\.rows).map(\.details) == ["Кафе", "Кафе"])
    }

    @Test("счета не ответили — прошлые имена остаются")
    func accountsKeptWhenTheyFail() async throws {
        let routes = RoutedTransport(
            page: [page(["a"]), page(["a"])],
            accounts: [.http(200, body: Self.accounts), .http(502, body: "Bad Gateway")]
        )
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()
        await list.refresh()

        #expect(list.days.flatMap(\.rows).map(\.details) == ["Кафе · Карта"])
        #expect(list.caption == "Обновлено только что")
    }

    @Test("нет адреса или токена — экран с «Настройки», запросов нет")
    func notConfigured() async throws {
        let routes = RoutedTransport()
        let list = list(try RecordsHarness(routes: routes, settings: TestSettings(configured: false)))

        await list.refresh()

        #expect(list.screen == .notConfigured)
        #expect(await routes.pages.requests.isEmpty)
        #expect(await routes.accountLists.requests.isEmpty)
    }

    @Test("пусто — «Записей пока нет»; неверный токен без кэша — экран токена; без связи без кэша — «Нет связи»")
    func emptyScreens() async throws {
        let routes = RoutedTransport(page: [
            .http(200, body: RecordsReply.page([])),
            .http(401, body: ServerReply.invalidToken),
        ])
        let harness = try RecordsHarness(routes: routes)
        let list = list(harness)
        #expect(list.screen == .loading)

        await list.refresh()
        #expect(list.screen == .empty)

        await list.refresh()
        #expect(list.screen == .tokenRefused)

        let offline = self.list(try RecordsHarness(routes: RoutedTransport(page: [.failure(.timedOut)])))
        await offline.refresh()
        #expect(offline.screen == .unreachable)
    }

    @Test("неверный токен при кэше — список и подпись о токене")
    func tokenRefusedWithCache() async throws {
        let routes = RoutedTransport(page: [page(["a"]), .http(403, body: ServerReply.invalidToken)])
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()
        await list.refresh()

        #expect(list.screen == .list)
        #expect(list.caption == "Сервер не принял токен · обновлено в 14:32")
    }

    @Test("сменили адрес, новый не отвечает — записей прошлого сервера на экране нет")
    func otherAddress() async throws {
        let routes = RoutedTransport(page: [page(["a"]), .failure(.cannotConnectToHost)])
        let harness = try RecordsHarness(routes: routes)
        let list = list(harness)
        await list.refresh()

        harness.settings.set(ServerConfiguration(baseURL: URL(string: "https://other.example.ts.net")!, token: TestSettings.token))
        await list.refresh()

        #expect(list.days.isEmpty)
        #expect(list.screen == .unreachable)
    }

    @Test("без связи прокрученные страницы остаются на экране")
    func offlineKeepsScrolledPages() async throws {
        let routes = RoutedTransport(page: [page(["a"], next: "cursor-1"), page(["b"]), .failure(.timedOut)])
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()
        await list.loadMore()

        await list.refresh()

        #expect(ids(list) == ["a", "b"])
        #expect(list.caption == "Нет связи · обновлено в 14:32")
    }

    @Test("обновляется при открытии вкладки и возврате в приложение; после отправки очереди — только на экране")
    func refreshTriggers() async throws {
        let routes = RoutedTransport(page: [page(["a"]), page(["a"]), page(["a"]), page(["a"])])
        let list = list(try RecordsHarness(routes: routes))

        await list.screenChanged(onScreen: false)
        await list.queueWroteRecords()
        #expect(await routes.pages.requests.isEmpty)

        // Opened the tab
        await list.screenChanged(onScreen: true)
        #expect(await routes.pages.requests.count == 1)
        // The queue wrote a record while the list is on screen
        await list.queueWroteRecords()
        #expect(await routes.pages.requests.count == 2)
        // Left the app and came back
        await list.screenChanged(onScreen: false)
        await list.queueWroteRecords()
        #expect(await routes.pages.requests.count == 2)
        await list.screenChanged(onScreen: true)
        #expect(await routes.pages.requests.count == 3)
    }

    @Test("обновления подряд, пока первое в пути, — одно следом, а не по одному на каждое и не два сразу")
    func refreshesJoin() async throws {
        let routes = RoutedTransport(page: [
            .after(.milliseconds(200), page(["a"])),
            page(["new", "a"]),
            page(["extra"]),
        ])
        let list = list(try RecordsHarness(routes: routes))

        async let first: Void = list.refresh()
        #expect(await eventually { await routes.pages.requests.count == 1 })
        async let second: Void = list.refresh()
        async let third: Void = list.refresh()
        _ = await (first, second, third)

        #expect(await routes.pages.requests.count == 2)
        // The pass after waits for the first: the pages go one by one
        #expect(await routes.pages.maxInFlight == 1)
        #expect(ids(list) == ["new", "a"])
    }
}
