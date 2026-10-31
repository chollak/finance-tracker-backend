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
    /// «Проверить»: the server was unsure and waits for a correction in the Mini App.
    let needsReview: Bool
}

/// The records of one day, under «Сегодня», «Вчера» or «27 октября».
struct RecordDay: Identifiable, Equatable, Sendable {
    /// The day, `YYYY-MM-DD`.
    let id: String
    let title: String
    let rows: [RecordRow]
}

/// The history by day, in the server's order — newest first. Pages are joined before grouping, so a day the next page
/// goes on stays one section.
enum RecordDays {
    static func days(
        _ records: [Record],
        accountNames: [String: String],
        now: Date,
        calendar: Calendar
    ) -> [RecordDay] {
        let titles = DayTitles(now: now, calendar: calendar)
        var order: [String] = []
        var rowsOfDay: [String: [RecordRow]] = [:]
        for record in records {
            let day = day(of: record, calendar: calendar)
            if rowsOfDay[day] == nil {
                order.append(day)
            }
            rowsOfDay[day, default: []].append(row(for: record, accountNames: accountNames))
        }
        return order.map { RecordDay(id: $0, title: titles.title(of: $0), rows: rowsOfDay[$0] ?? []) }
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

    private static func row(for record: Record, accountNames: [String: String]) -> RecordRow {
        let note = [record.description, record.merchant ?? ""]
            .lazy
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        let account = record.accountId.flatMap { accountNames[$0] }
        let category = record.category.isEmpty ? nil : record.category
        return RecordRow(
            id: record.id,
            title: note ?? category ?? "Без заметки",
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
