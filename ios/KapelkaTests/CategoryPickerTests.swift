import Foundation
import Testing
@testable import Kapelka

/// A tap on a row of «Записи» opens the sheet of categories (FT-221): the visible ones of the record's type, the
/// current one checked. A choice saves at once and closes the sheet; the row takes the server's answer. The server
/// learns from it (FT-184); `needsReview` stays as the server keeps it, as in the Mini App.
@MainActor
@Suite("Записи: сменить категорию")
struct CategoryPickerTests {
    private static let cafe = RecordsReply.category(id: "cat-cafe", name: "Кафе")
    private static let food = RecordsReply.category(id: "cat-food", name: "Продукты")
    private static let hidden = RecordsReply.category(id: "cat-old", name: "Подписки", isHidden: true)
    private static let salary = RecordsReply.category(id: "cat-salary", type: "income", name: "Зарплата")
    private static let categories = FakeTransport.Reply.http(
        200, body: RecordsReply.categories([cafe, food, hidden, salary])
    )

    private static let c = RecordsReply.record(id: "c", date: "2026-10-29", createdAt: "2026-10-29T12:00:00.000Z")
    private static let b = RecordsReply.record(
        id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z", merchant: "KORZINKA 12", needsReview: true
    )
    private static let a = RecordsReply.record(
        id: "a", date: "2026-10-28", createdAt: "2026-10-28T20:00:00.000Z", type: "income",
        categoryId: "cat-salary", category: "Зарплата", description: "зарплата"
    )
    private static let firstPage = FakeTransport.Reply.http(200, body: RecordsReply.page([c, b, a]))

    private func list(_ routes: RoutedTransport) throws -> RecordsList {
        let harness = try RecordsHarness(routes: routes)
        let clock = harness.clock
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        let timer = ManualTimer()
        return RecordsList(feed: harness.makeFeed(), now: { clock.now }, calendar: calendar, wait: { await timer.wait($0) })
    }

    private func picker(for id: String, in list: RecordsList) throws -> CategoryPicker {
        CategoryPicker(record: try #require(list.record(id: id)), list: list)
    }

    private func row(_ id: String, in list: RecordsList) -> RecordRow? {
        list.days.flatMap(\.rows).first { $0.id == id }
    }

    @Test("в шторке только видимые категории типа записи; у текущей галочка")
    func visibleOfRecordType() async throws {
        let routes = RoutedTransport(page: [Self.firstPage], categories: [Self.categories, Self.categories])
        let list = try list(routes)
        await list.refresh()

        let expense = try picker(for: "b", in: list)
        await expense.load()
        #expect(expense.choices == .loaded(try decoded([Self.cafe, Self.food])))
        #expect(expense.currentId == "cat-cafe")

        let income = try picker(for: "a", in: list)
        await income.load()
        #expect(income.choices == .loaded(try decoded([Self.salary])))
        #expect(income.currentId == "cat-salary")
    }

    @Test("выбор сохраняет и закрывает шторку; строка берёт ответ сервера; «проверить» не снимается")
    func choiceSaves() async throws {
        let edited = RecordsReply.record(
            id: "b", date: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z",
            categoryId: "cat-food", category: "Продукты", merchant: "KORZINKA 12", needsReview: true
        )
        let routes = RoutedTransport(
            page: [Self.firstPage],
            categories: [Self.categories],
            edits: [.http(200, body: RecordsReply.one(edited))]
        )
        let list = try list(routes)
        await list.refresh()
        let picker = try picker(for: "b", in: list)
        await picker.load()

        let closes = await picker.choose("cat-food")

        #expect(closes)
        #expect(row("b", in: list)?.details == "Продукты")
        #expect(row("b", in: list)?.needsReview == true)
        #expect(list.record(id: "b")?.categoryId == "cat-food")
        let request = try #require(await routes.recordEdits.requests.first)
        #expect(request.httpMethod == "PUT")
        #expect(request.url?.path() == "/api/transactions/b")
        // Only the category: «проверить» is the server's to keep, as with the Mini App
        #expect(try await routes.recordEdits.bodyKeys() == [["categoryId"]])
    }

    @Test("выбрал ту же категорию — запроса нет, шторка закрывается")
    func sameCategory() async throws {
        let routes = RoutedTransport(page: [Self.firstPage], categories: [Self.categories])
        let list = try list(routes)
        await list.refresh()
        let picker = try picker(for: "b", in: list)
        await picker.load()

        #expect(await picker.choose("cat-cafe"))
        #expect(await routes.recordEdits.requests.isEmpty)
    }

    @Test("без связи — ничего не меняется, «Нет связи — попробуй позже», шторка открыта")
    func choiceOffline() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            categories: [Self.categories],
            edits: [.failure(.notConnectedToInternet)]
        )
        let list = try list(routes)
        await list.refresh()
        let picker = try picker(for: "b", in: list)
        await picker.load()

        #expect(await picker.choose("cat-food") == false)

        #expect(picker.problem == "Нет связи — попробуй позже")
        #expect(picker.savingId == nil)
        #expect(row("b", in: list)?.details == "Кафе")
        #expect(list.record(id: "b")?.categoryId == "cat-cafe")
    }

    @Test("категории без связи не загрузились — сообщение в шторке; «Повторить» загружает")
    func categoriesOffline() async throws {
        let routes = RoutedTransport(page: [Self.firstPage], categories: [.failure(.timedOut), Self.categories])
        let list = try list(routes)
        await list.refresh()
        let picker = try picker(for: "b", in: list)

        await picker.load()
        #expect(picker.choices == .failed("Нет связи — попробуй позже"))

        await picker.load()
        #expect(picker.choices == .loaded(try decoded([Self.cafe, Self.food])))
    }

    @Test("запись уже удалена (404) — шторка закрывается, строки нет, «Запись уже удалена», список обновляется")
    func recordGone() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage, .http(200, body: RecordsReply.page([Self.c, Self.a]))],
            categories: [Self.categories],
            edits: [.http(404, body: RecordsReply.recordNotFound("b"))]
        )
        let list = try list(routes)
        await list.refresh()
        let picker = try picker(for: "b", in: list)
        await picker.load()

        #expect(await picker.choose("cat-food"))

        #expect(row("b", in: list) == nil)
        #expect(list.notice?.text == "Запись уже удалена")
        #expect(await eventually { await routes.pages.requests.count == 2 })
    }

    @Test("категории уже нет (404) — «Категории уже нет», список категорий обновлён, запись осталась")
    func categoryGone() async throws {
        let routes = RoutedTransport(
            page: [Self.firstPage],
            categories: [Self.categories, .http(200, body: RecordsReply.categories([Self.cafe, Self.salary]))],
            edits: [.http(404, body: RecordsReply.categoryNotFound("cat-food"))]
        )
        let list = try list(routes)
        await list.refresh()
        let picker = try picker(for: "b", in: list)
        await picker.load()

        #expect(await picker.choose("cat-food") == false)

        #expect(picker.problem == "Категории уже нет")
        #expect(picker.choices == .loaded(try decoded([Self.cafe])))
        #expect(await routes.categoryLists.requests.count == 2)
        #expect(row("b", in: list)?.details == "Кафе")
        #expect(list.notice == nil)
    }

    private func decoded(_ categories: [String]) throws -> [RecordCategory] {
        try categories.map { try JSONDecoder().decode(RecordCategory.self, from: Data($0.utf8)) }
    }
}
