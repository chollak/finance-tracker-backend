import Foundation

/// The line over a list the server did not refresh: why, and how old the list is — «Нет связи · обновлено в 14:32».
enum RecordsCaption {
    static func text(problem: RecordsFailure?, updatedAt: Date?, now: Date, calendar: Calendar) -> String? {
        guard let problem, let reason = reason(problem) else { return nil }
        guard let updatedAt else { return reason }
        return "\(reason) · обновлено \(when(updatedAt, now: now, calendar: calendar))"
    }

    /// `nil` when the screen says it instead (no address or token).
    private static func reason(_ problem: RecordsFailure) -> String? {
        switch problem {
        case .notConfigured: nil
        case .tokenRefused: "Сервер не принял токен"
        case .refused: "Сервер не принял запрос"
        // A refresh meets no others; they belong to the edits of FT-221
        case .unreachable, .recordGone, .categoryGone: "Нет связи"
        }
    }

    /// «в 14:32», «вчера в 14:32», «26 октября в 14:32».
    private static func when(_ moment: Date, now: Date, calendar: Calendar) -> String {
        let clock = RussianDate.formatter("HH:mm", calendar).string(from: moment)
        if calendar.isDate(moment, inSameDayAs: now) { return "в \(clock)" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(moment, inSameDayAs: yesterday) {
            return "вчера в \(clock)"
        }
        let sameYear = calendar.component(.year, from: moment) == calendar.component(.year, from: now)
        let day = RussianDate.formatter(sameYear ? "d MMMM" : "d MMMM y", calendar).string(from: moment)
        return "\(day) в \(clock)"
    }
}
