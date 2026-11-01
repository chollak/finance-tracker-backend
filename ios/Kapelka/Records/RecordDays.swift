import Foundation

/// One row of «Записи» (FT-220).
struct RecordRow: Identifiable, Equatable, Sendable {
    let id: String
    /// The note, else the merchant, else the category. Only «the note, else the merchant» is shared with the server's
    /// summary («Кофе · 25 000 сум» on «Записать») and the Mini App's caption; the Mini App's row title is the category.
    let title: String
    /// «Кафе · Карта»: the category and the account's name; without the account when the list of accounts does not
    /// name it. The category is left out when it is the title already.
    let details: String
    /// «−25 000 сум», «+1 200,50 USD».
    let amount: String
    /// Income is green with «+».
    let isIncome: Bool
    /// «Проверить»: the server was unsure and waits for a correction — in the Mini App; a new category does not clear it.
    let needsReview: Bool
}

/// One currency of a day's net: «−120 000 сум», «+12,00 USD».
struct DayTotal: Equatable, Sendable {
    let text: String
    /// Above zero: green with «+», as in the Mini App's history and as income is everywhere («Пастель»).
    let isIncome: Bool
}

/// The records of one day, under «Сегодня», «Вчера» or «27 октября».
struct RecordDay: Identifiable, Equatable, Sendable {
    /// The day, `YYYY-MM-DD`.
    let id: String
    let title: String
    /// The day's net, as the Mini App's history sums it (FT-254): сумы, then dollars apart. Empty for the last loaded
    /// day while the next page may go on with it.
    let totals: [DayTotal]
    let rows: [RecordRow]

    /// «−120 000 сум · −12,00 USD»; `nil` while the day waits for the next page.
    var total: String? {
        totals.isEmpty ? nil : totals.map(\.text).joined(separator: " · ")
    }

    /// «Сегодня · −120 000 сум · −12,00 USD».
    var header: String {
        [title, total].compactMap { $0 }.joined(separator: " · ")
    }
}

/// The history by day, in the server's order — newest first. Pages are joined before grouping, so a day the next page
/// goes on stays one section.
enum RecordDays {
    /// `lastDayComplete`: no page follows the loaded ones. Until then the last day may go on there, and its total
    /// waits — as `lastDayComplete` of the Mini App's history (`recordDays.ts`).
    static func days(
        _ records: [Record],
        accountNames: [String: String],
        now: Date,
        calendar: Calendar,
        lastDayComplete: Bool
    ) -> [RecordDay] {
        let titles = DayTitles(now: now, calendar: calendar)
        var order: [String] = []
        var recordsOfDay: [String: [Record]] = [:]
        for record in records {
            let day = day(of: record, calendar: calendar)
            if recordsOfDay[day] == nil {
                order.append(day)
            }
            recordsOfDay[day, default: []].append(record)
        }
        return order.enumerated().map { index, day in
            let ofDay = recordsOfDay[day] ?? []
            let complete = index < order.count - 1 || lastDayComplete
            return RecordDay(
                id: day,
                title: titles.title(of: day),
                totals: complete ? totals(of: ofDay) : [],
                rows: ofDay.map { row(for: $0, accountNames: accountNames) }
            )
        }
    }

    /// The net of the records, as the Mini App's history sums a day (`netInUzs`, `formatNetMinor`): all of them,
    /// «проверить» ones too; income adds, expenses subtract; summed in hundredths and rounded once, by `MoneyText`.
    /// Each currency apart and as it is — сумы first, then dollars, not at a rate (decision 2026-10-31).
    static func totals(of records: [Record]) -> [DayTotal] {
        var currencies: [String] = []
        var net: [String: Int] = [:]
        for record in records {
            if net[record.currency] == nil {
                currencies.append(record.currency)
            }
            net[record.currency, default: 0] += record.type == .income ? record.amountMinor : -record.amountMinor
        }
        let sumFirst = currencies.filter { $0 == "UZS" } + currencies.filter { $0 != "UZS" }
        return sumFirst.map { currency in
            let minor = net[currency] ?? 0
            return DayTotal(text: MoneyText.format(minor: minor, currency: currency, sign: .always), isIncome: minor > 0)
        }
    }

    /// The record's day: `date` as it is; a record saved before FT-100 keeps a full moment there — its day on the
    /// phone's calendar, as the Mini App counts it.
    static func day(of record: Record, calendar: Calendar) -> String {
        guard record.date.contains("T"), let moment = Moment.parse(record.date) else {
            return String(record.date.prefix(10))
        }
        let parts = calendar.dateComponents([.year, .month, .day], from: moment)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// The row's title: the note, else the merchant, else the category.
    static func title(of record: Record) -> String {
        note(of: record) ?? (record.category.isEmpty ? nil : record.category) ?? "Без заметки"
    }

    private static func note(of record: Record) -> String? {
        [record.description, record.merchant ?? ""]
            .lazy
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }

    private static func row(for record: Record, accountNames: [String: String]) -> RecordRow {
        let note = note(of: record)
        let account = record.accountId.flatMap { accountNames[$0] }
        let category = record.category.isEmpty ? nil : record.category
        return RecordRow(
            id: record.id,
            title: title(of: record),
            details: [note == nil ? nil : category, account].compactMap { $0 }.joined(separator: " · "),
            amount: MoneyText.signed(record),
            isIncome: record.type == .income,
            needsReview: record.needsReview
        )
    }
}

/// «Сегодня», «Вчера», «27 октября»; another year — «29 октября 2025».
private struct DayTitles {
    let today: String
    let yesterday: String
    let year: Int
    let calendar: Calendar
    let sameYear: DateFormatter
    let otherYear: DateFormatter

    init(now: Date, calendar: Calendar) {
        self.calendar = calendar
        today = Self.key(now, calendar)
        yesterday = calendar.date(byAdding: .day, value: -1, to: now).map { Self.key($0, calendar) } ?? ""
        year = calendar.component(.year, from: now)
        sameYear = RussianDate.formatter("d MMMM", calendar)
        otherYear = RussianDate.formatter("d MMMM y", calendar)
    }

    func title(of day: String) -> String {
        if day == today { return "Сегодня" }
        if day == yesterday { return "Вчера" }
        guard let date = Self.date(of: day, calendar) else { return day }
        return calendar.component(.year, from: date) == year ? sameYear.string(from: date) : otherYear.string(from: date)
    }

    private static func key(_ date: Date, _ calendar: Calendar) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Noon of the day: no clock change moves it to another date.
    private static func date(of day: String, _ calendar: Calendar) -> Date? {
        let numbers = day.split(separator: "-").compactMap { Int($0) }
        guard numbers.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: numbers[0], month: numbers[1], day: numbers[2], hour: 12))
    }
}

/// Dates in Russian on the given calendar's clock.
enum RussianDate {
    /// A fixed pattern, not a template: the template adds «г.» after the year. «MMMM» in a pattern is the genitive —
    /// «27 октября».
    static func formatter(_ pattern: String, _ calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = pattern
        return formatter
    }
}

/// The server's ISO moments, with or without the milliseconds.
private enum Moment {
    static func parse(_ text: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}
