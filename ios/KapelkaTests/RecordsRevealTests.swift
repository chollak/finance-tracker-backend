import Foundation
import Testing
@testable import Kapelka

/// FT-254: the refresh shows itself — «Обновляю…» while the tab refreshes by itself, the system's indicator alone on a
/// pull, «Обновлено N мин назад» after; the caption moves with the clock, the list does not (decision FT-220). A tap
/// on «Записал: …» scrolls to the record and highlights it for a second; a record not on the loaded pages opens the
/// tab at the top.
@MainActor
@Suite("Записи: обновление видно, переход к записи")
struct RecordsRevealTests {
    private let timer = ManualTimer()

    private func page(_ ids: [String], next: String? = nil, date: String = "2026-10-29") -> String {
        RecordsReply.page(ids.map { RecordsReply.record(id: $0, date: date) }, nextCursor: next)
    }

    private func list(_ routes: RoutedTransport) throws -> (RecordsList, TestClock) {
        let harness = try RecordsHarness(routes: routes)
        let clock = harness.clock
        let timer = timer
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        let list = RecordsList(feed: harness.makeFeed(), now: { clock.now }, calendar: calendar, wait: { await timer.wait($0) })
        return (list, clock)
    }

    // MARK: The caption

    @Test("открыл вкладку — «Обновляю…», пока страница в пути; потом «Обновлено только что»")
    func refreshingShows() async throws {
        let routes = RoutedTransport(page: [.after(.milliseconds(300), .http(200, body: page(["a"])))])
        let (list, _) = try list(routes)

        async let opened: Void = list.screenChanged(onScreen: true)
        #expect(await eventually { await MainActor.run { list.status == .refreshing } })
        #expect(list.caption == "Обновляю…")
        await opened

        #expect(list.caption == "Обновлено только что")
    }

    @Test("потянул вниз — только системный индикатор: подпись прежняя, пока страница в пути")
    func pullShowsNoCaption() async throws {
        let routes = RoutedTransport(page: [
            .http(200, body: page(["a"])),
            .after(.milliseconds(300), .http(200, body: page(["b", "a"]))),
        ])
        let (list, clock) = try list(routes)
        await list.refresh()
        clock.advance(by: 5 * 60)

        async let pulled: Void = list.refresh(pulled: true)
        #expect(await eventually { await routes.pages.requests.count == 2 })
        #expect(list.caption == "Обновлено 5 мин назад")
        await pulled

        #expect(list.caption == "Обновлено только что")
    }

    @Test("подпись идёт со временем, список по таймеру не обновляется")
    func captionFollowsClock() async throws {
        let routes = RoutedTransport(page: [.http(200, body: page(["a"]))])
        let (list, clock) = try list(routes)
        await list.refresh()

        #expect(list.caption(at: clock.now.addingTimeInterval(12 * 60)) == "Обновлено 12 мин назад")
        #expect(list.caption(at: clock.now.addingTimeInterval(61 * 60)) == "Обновлено в 14:32")
        #expect(await routes.pages.requests.count == 1)
    }

    @Test("без связи — «Нет связи · обновлено в 14:32», как раньше")
    func offlineCaption() async throws {
        let routes = RoutedTransport(page: [.http(200, body: page(["a"])), .failure(.notConnectedToInternet)])
        let (list, clock) = try list(routes)
        await list.refresh()
        clock.advance(by: 10 * 60)

        await list.refresh()

        #expect(list.caption == "Нет связи · обновлено в 14:32")
    }

    // MARK: To the record

    @Test("запись на загруженной странице — прокрутка к ней и подсветка на секунду")
    func revealsLoaded() async throws {
        let routes = RoutedTransport(page: [.http(200, body: page(["a", "b"]))])
        let (list, _) = try list(routes)
        await list.screenChanged(onScreen: true)

        list.reveal("b")

        #expect(list.scroll?.target == .record("b"))
        #expect(list.highlighted == "b")
        #expect(await eventually { timer.durations == [.seconds(1)] })
        timer.fire()
        #expect(await eventually { await MainActor.run { list.highlighted == nil } })
    }

    @Test("запись на прокрученной странице — тоже находится")
    func revealsScrolled() async throws {
        let routes = RoutedTransport(page: [
            .http(200, body: page(["a"], next: "cursor-1")),
            .http(200, body: page(["old"], date: "2026-10-20")),
        ])
        let (list, _) = try list(routes)
        await list.screenChanged(onScreen: true)
        await list.loadMore()

        list.reveal("old")

        #expect(list.scroll?.target == .record("old"))
        #expect(list.highlighted == "old")
    }

    @Test("записи нет на загруженных страницах — вкладка сверху, без подсветки")
    func notLoadedOpensTop() async throws {
        let routes = RoutedTransport(page: [.http(200, body: page(["a"], next: "cursor-1"))])
        let (list, _) = try list(routes)
        await list.screenChanged(onScreen: true)

        list.reveal("day-before-yesterday")

        #expect(list.scroll?.target == .top)
        #expect(list.highlighted == nil)
    }

    @Test("обновление в пути — переход ждёт его: запись приходит с новой страницей")
    func waitsForRefresh() async throws {
        let routes = RoutedTransport(page: [
            .http(200, body: page(["a"])),
            .after(.milliseconds(300), .http(200, body: page(["new", "a"]))),
        ])
        let (list, _) = try list(routes)
        await list.screenChanged(onScreen: true)

        list.startRefresh()
        list.reveal("new")
        #expect(list.scroll == nil)

        #expect(await eventually { await MainActor.run { list.scroll?.target == .record("new") } })
        #expect(list.highlighted == "new")
    }

    @Test("вкладка ещё не на экране — переход ждёт её обновления")
    func waitsForScreen() async throws {
        let routes = RoutedTransport(page: [.http(200, body: page(["new"]))])
        let (list, _) = try list(routes)

        list.reveal("new")
        #expect(list.scroll == nil)
        await list.screenChanged(onScreen: true)

        #expect(list.scroll?.target == .record("new"))
    }

    @Test("прокрутку экран берёт один раз; второй переход к той же записи — новый")
    func scrollTakenOnce() async throws {
        let routes = RoutedTransport(page: [.http(200, body: page(["a"]))])
        let (list, _) = try list(routes)
        await list.screenChanged(onScreen: true)

        list.reveal("a")
        let first = try #require(list.scroll)
        list.scrolled(first.number)
        #expect(list.scroll == nil)

        list.reveal("a")
        #expect(list.scroll?.number != first.number)
        #expect(list.scroll?.target == .record("a"))
    }

    @Test("удалённая свайпом, пока плашка видна, — вкладка сверху")
    func deletedOpensTop() async throws {
        let routes = RoutedTransport(
            page: [.http(200, body: page(["a", "b"]))],
            edits: [.http(200, body: RecordsReply.deleted("b"))]
        )
        let (list, _) = try list(routes)
        await list.screenChanged(onScreen: true)
        await list.delete("b")

        list.reveal("b")

        #expect(list.scroll?.target == .top)
    }
}
