import Foundation
import Testing
@testable import Kapelka

/// The day's total in the header of «Записи» (FT-254, decision 2026-10-31): as the Mini App's history
/// (`buildRecordDays` with `dayTotals`, `netInUzs` and `formatNetMinor` in `webapp/src/entities/transaction/lib`) —
/// all the records of the day, «проверить» ones too, income adds, expenses subtract, summed in tiyins and rounded
/// once; dollars apart, as they are, not at a rate. The last loaded day waits for the next page (`lastDayComplete`).
@Suite("Записи: итог дня")
struct RecordDayTotalsTests {
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
        amountMinor: Int,
        currency: String = "UZS",
        needsReview: Bool = false
    ) throws -> Record {
        let json = RecordsReply.record(
            id: id, date: date, type: type, amountMinor: amountMinor, currency: currency, needsReview: needsReview
        )
        return try JSONDecoder().decode(Record.self, from: Data(json.utf8))
    }

    private func days(_ records: [Record], lastDayComplete: Bool = true) -> [RecordDay] {
        RecordDays.days(records, accountNames: [:], now: Self.now, calendar: calendar, lastDayComplete: lastDayComplete)
    }

    private func headers(_ records: [Record], lastDayComplete: Bool = true) -> [String] {
        days(records, lastDayComplete: lastDayComplete).map(\.header)
    }

    @Test("расходы вычитаются, доходы прибавляются; итог в сумах со знаком в заголовке дня")
    func netOfDay() throws {
        let list = try headers([
            record("coffee", amountMinor: 2_500_000),
            record("taxi", amountMinor: 1_800_000),
            record("salary", date: "2026-10-28", type: "income", amountMinor: 1_200_000_000),
            record("bread", date: "2026-10-28", amountMinor: 500_000),
        ])

        #expect(list == [
            "Сегодня · \u{2212}43\u{00A0}000\u{00A0}сум",
            "Вчера · +11\u{00A0}995\u{00A0}000\u{00A0}сум",
        ])
    }

    @Test("записи «проверить» в итоге тоже — как в истории Mini App")
    func flaggedCount() throws {
        let list = try days([
            record("sure", amountMinor: 2_500_000),
            record("unsure", amountMinor: 10_000_000, needsReview: true),
        ])

        #expect(list.map(\.total) == ["\u{2212}125\u{00A0}000\u{00A0}сум"])
    }

    @Test("доллары — отдельной суммой без пересчёта; день только в долларах — только доллары")
    func dollarsApart() throws {
        let list = try headers([
            record("lunch", amountMinor: 12_000_000),
            record("headphones", amountMinor: 5_500, currency: "USD"),
            record("refund", type: "income", amountMinor: 4_300, currency: "USD"),
            record("app", date: "2026-10-28", amountMinor: 999, currency: "USD"),
        ])

        #expect(list == [
            "Сегодня · \u{2212}120\u{00A0}000\u{00A0}сум · \u{2212}12,00\u{00A0}USD",
            "Вчера · \u{2212}9,99\u{00A0}USD",
        ])
    }

    @Test("сумы складываются в тийинах и округляются один раз — как formatMinor у Mini App")
    func roundsOnce() throws {
        // 25 000,50 + 25 000,50 = 50 001 сум; each rounded first would give 50 002
        let list = try days([
            record("a", amountMinor: 2_500_050),
            record("b", amountMinor: 2_500_050),
        ])

        #expect(list.map(\.total) == ["\u{2212}50\u{00A0}001\u{00A0}сум"])
    }

    @Test("ноль — «0 сум» без знака, как у Mini App")
    func zero() throws {
        let list = try days([
            record("in", type: "income", amountMinor: 2_500_000),
            record("out", amountMinor: 2_500_000),
        ])

        #expect(list.map(\.total) == ["0\u{00A0}сум"])
    }

    @Test("последний день загруженных страниц — без итога, пока не пришла следующая; остальные — с итогом")
    func lastDayWaitsForNextPage() throws {
        let records = try [
            record("a", amountMinor: 2_500_000),
            record("b", date: "2026-10-28", amountMinor: 500_000),
        ]

        #expect(days(records, lastDayComplete: false).map(\.total) == ["\u{2212}25\u{00A0}000\u{00A0}сум", nil])
        #expect(headers(records, lastDayComplete: false) == ["Сегодня · \u{2212}25\u{00A0}000\u{00A0}сум", "Вчера"])
        #expect(days(Array(records.prefix(1)), lastDayComplete: false).map(\.total) == [nil])
        #expect(days(records, lastDayComplete: true).map(\.total) == [
            "\u{2212}25\u{00A0}000\u{00A0}сум", "\u{2212}5\u{00A0}000\u{00A0}сум",
        ])
    }

    @Test("день на стыке страниц — один итог за все его записи")
    func dayAcrossPages() throws {
        let firstPage = try [record("a", amountMinor: 2_500_000), record("b", date: "2026-10-28", amountMinor: 500_000)]
        let nextPage = try [record("c", date: "2026-10-28", amountMinor: 1_000_000)]

        #expect(days(firstPage + nextPage).map(\.total) == [
            "\u{2212}25\u{00A0}000\u{00A0}сум", "\u{2212}15\u{00A0}000\u{00A0}сум",
        ])
    }
}
