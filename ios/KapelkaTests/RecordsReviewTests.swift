import Foundation
import Testing
@testable import Kapelka

/// «!» in the sheet of FT-221 (FT-254): why — from the queue's answer while the record is as written, the general
/// phrase otherwise — and «Да, верно», `PUT { needsReview: false }`, which takes «!» off with «успех». Without a
/// network and on 404 as the category is (FT-221). A new category does not take «!» off (decision 2026-10-31).
@MainActor
@Suite("Записи: «!» и «Да, верно»")
struct RecordsReviewTests {
    private static let phraseId = UUID(uuidString: "3903229C-4ACB-4547-8620-13DC3B9FAA9E")!

    private static func flagged(categoryId: String = "cat-cafe", category: String = "Кафе", needsReview: Bool = true) -> String {
        RecordsReply.record(
            id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z", amountMinor: 4_500_000,
            categoryId: categoryId, category: category, needsReview: needsReview,
            clientId: phraseId.uuidString.lowercased()
        )
    }

    private static let sure = RecordsReply.record(id: "a", date: "2026-10-28", createdAt: "2026-10-28T20:00:00.000Z")
    private static let firstPage = FakeTransport.Reply.http(200, body: RecordsReply.page([flagged(), sure]))
    private static let categories = FakeTransport.Reply.http(200, body: RecordsReply.categories([
        RecordsReply.category(id: "cat-cafe", name: "Кафе"),
        RecordsReply.category(id: "cat-food", name: "Продукты"),
    ]))

    /// What the queue kept for «кофе 45»: as written, with «45» read as 45 000.
    private static let kept = CapturedRecord(
        id: "b", type: .expense, amountMinor: 4_500_000, currency: "UZS", categoryId: "cat-cafe", category: "Кафе",
        accountId: "acc-card", accountName: "Карта", description: "кофе", needsReview: true,
        assumptions: [.thousands(written: "45", amount: 45_000), .account(name: "Карта", reason: .byDefault)],
        deletedAt: nil
    )

    private let log = FeedbackLog()
    private let timer = ManualTimer()

    private func list(_ harness: RecordsHarness, answer: CapturedRecord? = Self.kept) -> RecordsList {
        let clock = harness.clock
        let timer = timer
        let phraseId = Self.phraseId
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        return RecordsList(
            feed: harness.makeFeed(),
            now: { clock.now },
            calendar: calendar,
            wait: { await timer.wait($0) },
            feedback: log.add,
            answer: { record in record.captureClientId == phraseId && record.id == answer?.id ? answer : nil }
        )
    }

    private func opened(_ id: String, in list: RecordsList) async throws -> CategoryPicker {
        list.openPicker(for: id)
        let picker = try #require(list.picker)
        await picker.load()
        return picker
    }

    private func row(_ id: String, in list: RecordsList) -> RecordRow? {
        list.days.flatMap(\.rows).first { $0.id == id }
    }

    @Test("«!» с ответом очереди — «Что я предположил»; без ответа — общая фраза; без «!» — ничего")
    func reasonInSheet() async throws {
        let routes = RoutedTransport(page: [Self.firstPage], categories: [Self.categories, Self.categories, Self.categories])
        let harness = try RecordsHarness(routes: routes)
        let list = list(harness)
        await list.refresh()

        #expect(try await opened("b", in: list).review == .assumed([
            "«45» понял как 45\u{00A0}000\u{00A0}сум",
            "Счёт «Карта» — по умолчанию",
        ]))
        #expect(try await opened("a", in: list).review == nil)

        let elsewhere = self.list(harness, answer: nil)
        await elsewhere.refresh()
        #expect(try await opened("b", in: elsewhere).review == .unsure)
    }

    @Test("«Да, верно» — PUT { needsReview: false }, «!» снят и на диске, «успех», шторка закрыта")
    func confirm() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage, .failure(.notConnectedToInternet)],
            categories: [Self.categories],
            edits: [.http(200, body: RecordsReply.one(Self.flagged(needsReview: false)))]
        )
        let harness = try RecordsHarness(routes: routes)
        let list = list(harness)
        await list.refresh()
        let picker = try await opened("b", in: list)

        #expect(await picker.confirm())

        #expect(row("b", in: list)?.needsReview == false)
        #expect(list.record(id: "b")?.needsReview == false)
        #expect(list.picker == nil)
        #expect(log.events == [.editSaved])
        let request = try #require(await routes.recordEdits.requests.first)
        #expect(request.httpMethod == "PUT")
        #expect(request.url?.path() == "/api/transactions/b")
        let body = try JSONSerialization.jsonObject(with: try #require(request.httpBody)) as? [String: Bool]
        #expect(body == ["needsReview": false])

        // The page on disk follows the server: started anew without a network, «!» stays off
        let restarted = self.list(harness)
        await restarted.refresh()
        #expect(row("b", in: restarted)?.needsReview == false)
    }

    @Test("«Да, верно» без связи — «!» на месте, «Нет связи — попробуй позже» в шторке, она открыта, «ошибка»")
    func confirmOffline() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            categories: [Self.categories],
            edits: [.failure(.notConnectedToInternet)]
        )
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()
        let picker = try await opened("b", in: list)

        #expect(await picker.confirm() == false)

        #expect(picker.reviewProblem == "Нет связи — попробуй позже")
        #expect(picker.isConfirming == false)
        #expect(list.picker === picker)
        #expect(row("b", in: list)?.needsReview == true)
        #expect(log.events == [.editFailed])
    }

    @Test("«Да, верно» на удалённой (404) — шторка закрыта, строки нет, «Запись уже удалена», список обновляется")
    func confirmGone() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage, .http(200, body: RecordsReply.page([Self.sure]))],
            categories: [Self.categories],
            edits: [.http(404, body: RecordsReply.recordNotFound("b"))]
        )
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()
        let picker = try await opened("b", in: list)

        #expect(await picker.confirm())

        #expect(list.picker == nil)
        #expect(row("b", in: list) == nil)
        #expect(list.notice?.text == "Запись уже удалена")
        #expect(await eventually { await routes.pages.requests.count == 2 })
    }

    @Test("выбор категории «!» не снимает; потом догадки устарели — общая фраза")
    func categoryKeepsFlag() async throws {
        let moved = Self.flagged(categoryId: "cat-food", category: "Продукты")
        let routes = RoutedTransport(
            page: [Self.firstPage],
            categories: [Self.categories, Self.categories],
            edits: [.http(200, body: RecordsReply.one(moved))]
        )
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()

        let picker = try await opened("b", in: list)
        #expect(await picker.choose("cat-food"))

        #expect(row("b", in: list)?.needsReview == true)
        #expect(try await routes.recordEdits.bodyKeys() == [["categoryId"]])
        #expect(try await opened("b", in: list).review == .unsure)
    }

    @Test("пока «Да, верно» в пути — категории не выбрать, и наоборот")
    func oneEditAtATime() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            categories: [Self.categories],
            edits: [.after(.milliseconds(200), .http(200, body: RecordsReply.one(Self.flagged(needsReview: false))))]
        )
        let list = list(try RecordsHarness(routes: routes))
        await list.refresh()
        let picker = try await opened("b", in: list)

        async let confirmed = picker.confirm()
        #expect(await eventually { await MainActor.run { picker.isConfirming } })
        #expect(await picker.choose("cat-food") == false)
        #expect(await picker.confirm() == false)
        #expect(await confirmed)
        #expect(await routes.recordEdits.requests.count == 1)
    }
}
