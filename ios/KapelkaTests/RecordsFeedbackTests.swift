import Foundation
import Testing
@testable import Kapelka

/// The edits of «Записи» in the haptics (FT-251): the category saved and «Вернуть» — success; a delete, «Вернуть» or a
/// category the server did not take — error. The swipe itself is felt by the swipe: no haptic for a delete that went.
@MainActor
@Suite("Записи: отклик на правки")
struct RecordsFeedbackTests {
    private static let b = RecordsReply.record(id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z")
    private static let a = RecordsReply.record(id: "a", date: "2026-10-28", createdAt: "2026-10-28T20:00:00.000Z")
    private static let firstPage = FakeTransport.Reply.http(200, body: RecordsReply.page([b, a]))
    private static let categories = FakeTransport.Reply.http(200, body: RecordsReply.categories([
        RecordsReply.category(id: "cat-cafe", name: "Кафе"),
        RecordsReply.category(id: "cat-food", name: "Продукты"),
    ]))

    private let timer = ManualTimer()
    private let log = FeedbackLog()

    private func list(_ routes: RoutedTransport) async throws -> RecordsList {
        let harness = try RecordsHarness(routes: routes)
        let clock = harness.clock
        let timer = timer
        let list = RecordsList(
            feed: harness.makeFeed(),
            now: { clock.now },
            wait: { await timer.wait($0) },
            feedback: log.add
        )
        await list.refresh()
        return list
    }

    private func choose(_ categoryId: String, for id: String, in list: RecordsList) async throws -> Bool {
        let picker = CategoryPicker(record: try #require(list.record(id: id)), list: list)
        await picker.load()
        return await picker.choose(categoryId)
    }

    @Test("удалил — без отклика; «Вернуть» сработало — success")
    func deleteThenRestore() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [.http(200, body: RecordsReply.deleted("b")), .http(200, body: RecordsReply.one(Self.b))]
        )
        let list = try await list(routes)

        await list.delete("b")
        #expect(log.events.isEmpty)
        await list.restoreDeleted()

        #expect(log.events == [.editSaved])
    }

    @Test("удалить без связи и уже удалённую (404) — error")
    func deleteFailed() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage, Self.firstPage],
            edits: [.failure(.notConnectedToInternet), .http(404, body: RecordsReply.recordNotFound("a"))]
        )
        let list = try await list(routes)

        await list.delete("b")
        await list.delete("a")

        #expect(log.events == [.editFailed, .editFailed])
    }

    @Test("«Вернуть» без связи — error")
    func restoreFailed() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            edits: [.http(200, body: RecordsReply.deleted("b")), .failure(.notConnectedToInternet)]
        )
        let list = try await list(routes)
        await list.delete("b")

        await list.restoreDeleted()

        #expect(log.events == [.editFailed])
    }

    @Test("категория сохранена — success; та же категория — без отклика")
    func categorySaved() async throws {
        let edited = RecordsReply.record(
            id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z", categoryId: "cat-food", category: "Продукты"
        )
        let routes = RoutedTransport(
            page: [Self.firstPage],
            categories: [Self.categories, Self.categories],
            edits: [.http(200, body: RecordsReply.one(edited))]
        )
        let list = try await list(routes)

        #expect(try await choose("cat-cafe", for: "a", in: list))
        #expect(log.events.isEmpty)
        #expect(try await choose("cat-food", for: "b", in: list))

        #expect(log.events == [.editSaved])
    }

    @Test("категория без связи, удалённая категория и запись — error")
    func categoryFailed() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage, Self.firstPage],
            categories: [Self.categories, Self.categories, Self.categories, Self.categories],
            edits: [
                .failure(.notConnectedToInternet),
                .http(404, body: RecordsReply.categoryNotFound("cat-food")),
                .http(404, body: RecordsReply.recordNotFound("a")),
            ]
        )
        let list = try await list(routes)

        #expect(try await !choose("cat-food", for: "b", in: list))
        #expect(try await !choose("cat-food", for: "b", in: list))
        #expect(try await choose("cat-food", for: "a", in: list))

        #expect(log.events == [.editFailed, .editFailed, .editFailed])
    }
}
