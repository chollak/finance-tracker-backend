import Foundation
import Testing
@testable import Kapelka

/// The tab «Записи» (FT-220): the server's records by day, newest first, a row per record — the note or the merchant,
/// «категория · счёт», the amount with its sign, the mark «проверить».
@Suite("Записи: список по дням")
struct RecordDaysTests {
    /// 2026-10-29 14:32:05 in Tashkent.
    private static let now = TestClock().now

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        return calendar
    }

    private func record(
        _ id: String,
        date: String = "2026-10-29",
        type: String = "expense",
        amountMinor: Int = 2_500_000,
        currency: String = "UZS",
        category: String = "Кафе",
        description: String = "кофе",
        merchant: String? = nil,
        needsReview: Bool = false,
        accountId: String? = "acc-card"
    ) throws -> Record {
        let json = RecordsReply.record(
            id: id, date: date, type: type, amountMinor: amountMinor, currency: currency, category: category,
            description: description, merchant: merchant, needsReview: needsReview, accountId: accountId
        )
        return try JSONDecoder().decode(Record.self, from: Data(json.utf8))
    }

    private func days(_ records: [Record], accounts: [String: String] = ["acc-card": "Карта"]) -> [RecordDay] {
        RecordDays.days(records, accountNames: accounts, now: Self.now, calendar: calendar)
    }

    @Test("секции: «Сегодня», «Вчера», «27 октября», другой год — с годом; порядок сервера")
    func sections() throws {
        let list = days([
            try record("a"),
            try record("b"),
            try record("c", date: "2026-10-28"),
            try record("d", date: "2026-10-27"),
            try record("e", date: "2025-10-29"),
        ])

        #expect(list.map(\.title) == ["Сегодня", "Вчера", "27 октября", "29 октября 2025"])
        #expect(list.map(\.id) == ["2026-10-29", "2026-10-28", "2026-10-27", "2025-10-29"])
        #expect(list.map { $0.rows.map(\.id) } == [["a", "b"], ["c"], ["d"], ["e"]])
    }

    @Test("начало января: «Вчера» — 31 декабря прошлого года")
    func yesterdayAcrossYears() throws {
        // 2027-01-01 10:00 in Tashkent
        let newYear = Date(timeIntervalSince1970: 1_798_779_600)
        let list = RecordDays.days(
            [try record("a", date: "2026-12-31"), try record("b", date: "2026-12-30")],
            accountNames: [:], now: newYear, calendar: calendar
        )
        #expect(list.map(\.title) == ["Вчера", "30 декабря 2026"])
    }

    @Test("запись до FT-100 с полным моментом в `date` — в своём дне по часам телефона")
    func fullMomentDate() throws {
        // 2026-10-28 20:30 UTC is 2026-10-29 01:30 in Tashkent
        let list = days([try record("a"), try record("old", date: "2026-10-28T20:30:00.000Z"), try record("b", date: "2026-10-28")])

        #expect(list.map(\.title) == ["Сегодня", "Вчера"])
        #expect(list.map { $0.rows.map(\.id) } == [["a", "old"], ["b"]])
    }

    @Test("день, начатый на одной странице и продолженный на следующей, — одна секция")
    func dayAcrossPages() throws {
        let firstPage = [try record("a"), try record("b", date: "2026-10-28")]
        let nextPage = [try record("c", date: "2026-10-28"), try record("d", date: "2026-10-27")]

        let list = days(firstPage + nextPage)
        #expect(list.map { $0.rows.map(\.id) } == [["a"], ["b", "c"], ["d"]])
    }

    @Test("строка: заметка, «категория · счёт», сумма со знаком; доход — зелёный с «+»")
    func row() throws {
        let rows = days([
            try record("coffee"),
            try record("salary", type: "income", amountMinor: 1_200_000_000, category: "Зарплата", description: "зарплата"),
            try record("lunch", amountMinor: 120_050, currency: "USD", category: "Обед", description: "обед"),
        ]).flatMap(\.rows)

        #expect(rows[0] == RecordRow(
            id: "coffee", title: "кофе", details: "Кафе · Карта", amount: "\u{2212}25\u{00A0}000\u{00A0}сум",
            isIncome: false, needsReview: false
        ))
        #expect(rows[1].amount == "+12\u{00A0}000\u{00A0}000\u{00A0}сум")
        #expect(rows[1].isIncome)
        #expect(rows[2].amount == "\u{2212}1\u{00A0}200,50\u{00A0}USD")
    }

    @Test("без заметки — магазин; без обоих — категория, и она не повторяется под ней")
    func title() throws {
        let rows = days([
            try record("pay", description: "", merchant: "Ooo Mazzali Super Food"),
            try record("both", description: "кофе", merchant: "Bon"),
            try record("bare", description: " ", merchant: nil),
            try record("bare-no-account", description: "", merchant: nil, accountId: nil),
        ]).flatMap(\.rows)

        #expect(rows.map(\.title) == ["Ooo Mazzali Super Food", "кофе", "Кафе", "Кафе"])
        #expect(rows.map(\.details) == ["Кафе · Карта", "Кафе · Карта", "Карта", ""])
    }

    @Test("счёта нет в списке или у записи нет счёта — строка без имени счёта, но на месте")
    func unknownAccount() throws {
        let rows = days(
            [try record("gone", accountId: "acc-deleted"), try record("none", accountId: nil), try record("known")],
            accounts: ["acc-card": "Карта"]
        ).flatMap(\.rows)

        #expect(rows.map(\.id) == ["gone", "none", "known"])
        #expect(rows.map(\.details) == ["Кафе", "Кафе", "Кафе · Карта"])

        // Without a network the accounts are not read at all: the category alone
        let offline = days([try record("known")], accounts: [:]).flatMap(\.rows)
        #expect(offline.map(\.details) == ["Кафе"])
    }

    @Test("«проверить» — у записи, которая ждёт проверки")
    func needsReview() throws {
        let rows = days([try record("unsure", needsReview: true), try record("sure")]).flatMap(\.rows)
        #expect(rows.map(\.needsReview) == [true, false])
    }

    @Test("пустой список — без секций")
    func empty() {
        #expect(days([]).isEmpty)
    }
}
