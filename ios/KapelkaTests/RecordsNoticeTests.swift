import Foundation
import Testing
@testable import Kapelka

/// The bar at the bottom of «Записи» (FT-221, review of PR #161): what an edit says is never lost to another edit.
/// «Вернуть» on its way keeps the bar with the button off; a «Вернуть» or a delete that failed says so even when
/// another delete has the bar; with VoiceOver the bar stays until it is closed or another edit starts.
@MainActor
@Suite("Записи: плашка")
struct RecordsNoticeTests {
    private static let c = RecordsReply.record(
        id: "c", date: "2026-10-29", createdAt: "2026-10-29T12:00:00.000Z", description: "кофе"
    )
    private static let b = RecordsReply.record(
        id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z", description: "такси"
    )
    private static let a = RecordsReply.record(
        id: "a", date: "2026-10-28", createdAt: "2026-10-28T20:00:00.000Z", description: "обед"
    )
    private static let firstPage = FakeTransport.Reply.http(200, body: RecordsReply.page([c, b, a]))

    private let timer = ManualTimer()

    private func list(_ routes: RoutedTransport, voiceOver: Bool = false) throws -> RecordsList {
        let harness = try RecordsHarness(routes: routes)
        let clock = harness.clock
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        let timer = timer
        return RecordsList(
            feed: harness.makeFeed(),
            now: { clock.now },
            calendar: calendar,
            wait: { await timer.wait($0) },
            keepsNotices: { voiceOver }
        )
    }

    private func ids(_ list: RecordsList) -> [String] {
        list.days.flatMap(\.rows).map(\.id)
    }

    @Test("пока «Вернуть» в пути, плашка на месте и кнопка выключена; вернул — плашки нет")
    func restoringKeepsTheBar() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [.http(200, body: RecordsReply.deleted("b")), .after(.milliseconds(300), .http(200, body: RecordsReply.one(Self.b)))]
        )
        let list = try list(routes)
        await list.refresh()
        await list.delete("b")

        async let restoring: Void = list.restoreDeleted()
        #expect(await eventually { @MainActor in list.notice?.undo?.isRestoring == true })
        #expect(list.notice?.restorable == "b")
        // Its 5 s end meanwhile: the bar waits for the answer
        timer.fire()
        try await Task.sleep(for: .milliseconds(50))
        #expect(list.notice?.undo?.isRestoring == true)
        // A second tap sends nothing more
        await list.restoreDeleted()
        await restoring

        #expect(list.notice == nil)
        #expect(ids(list) == ["c", "b", "a"])
        #expect(await routes.recordEdits.requests.count == 2)
    }

    @Test("«Вернуть» не прошёл, когда начато другое удаление, — сообщение со своим «Вернуть»")
    func failedRestoreSaysSoOverAnotherDelete() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [
                .http(200, body: RecordsReply.deleted("b")),
                .after(.milliseconds(300), .failure(.timedOut)),
                .http(200, body: RecordsReply.deleted("c")),
                .http(200, body: RecordsReply.one(Self.b)),
            ]
        )
        let list = try list(routes)
        await list.refresh()
        await list.delete("b")

        async let restoring: Void = list.restoreDeleted()
        #expect(await eventually { await routes.recordEdits.requests.count == 2 })
        await list.delete("c")
        #expect(list.notice?.restorable == "c")
        await restoring

        #expect(list.notice?.message == "Не вернул «такси» — нет связи")
        #expect(list.notice?.restorable == "b")
        #expect(ids(list) == ["a"])

        await list.restoreDeleted()
        #expect(ids(list) == ["b", "a"])
    }

    @Test("удаление не прошло, когда начато другое, — сообщение, «Вернуть» другого на месте")
    func failedDeleteSaysSoBesideAnotherUndo() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [
                .after(.milliseconds(300), .failure(.notConnectedToInternet)),
                .http(200, body: RecordsReply.deleted("c")),
            ]
        )
        let list = try list(routes)
        await list.refresh()

        async let deleting: Void = list.delete("b")
        #expect(await eventually { await routes.recordEdits.requests.count == 1 })
        await list.delete("c")
        await deleting

        #expect(ids(list) == ["b", "a"])
        #expect(list.notice?.message == "Не удалил «такси» — нет связи")
        #expect(list.notice?.restorable == "c")
    }

    @Test("«Запись уже удалена» при смене категории не теряется, когда приходит ответ на другое удаление")
    func recordGoneOnCategoryKeepsItsMessage() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage, .http(200, body: RecordsReply.page([Self.a]))],
            edits: [
                .after(.milliseconds(300), .http(200, body: RecordsReply.deleted("c"))),
                .http(404, body: RecordsReply.recordNotFound("b")),
            ]
        )
        let list = try list(routes)
        await list.refresh()

        async let deleting: Void = list.delete("c")
        #expect(await eventually { await routes.recordEdits.requests.count == 1 })
        await #expect(throws: RecordsFailure.recordGone) { try await list.setCategory("cat-food", of: "b") }
        #expect(list.notice?.message == "Запись уже удалена")
        await deleting

        #expect(list.notice?.message == "Запись уже удалена")
        #expect(list.notice?.restorable == "c")
    }

    @Test("с VoiceOver плашка не уходит по таймеру — пока её не закроют или не начнётся новое действие")
    func voiceOverKeepsTheBar() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [.http(200, body: RecordsReply.deleted("b")), .http(200, body: RecordsReply.deleted("c"))]
        )
        let list = try list(routes, voiceOver: true)
        await list.refresh()
        await list.delete("b")

        #expect(await eventually { timer.durations.count == 1 })
        timer.fire()
        try await Task.sleep(for: .milliseconds(50))
        #expect(list.notice?.restorable == "b")

        await list.delete("c")
        #expect(list.notice?.restorable == "c")

        list.dismissNotice()
        #expect(list.notice == nil)
    }
}
