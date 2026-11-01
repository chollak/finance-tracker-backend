import Foundation

/// Where the list of «Записи» stands (FT-254): what the line over it says.
enum RecordsStatus: Equatable, Sendable {
    /// The tab refreshes by itself — opened, the app came back, the queue wrote: «Обновляю…». A pull shows the
    /// system's indicator instead.
    case refreshing
    /// The server answered at this moment.
    case updated(Date)
    /// It did not: why, and when the list on screen came — `nil` when nothing is on disk.
    case stale(RecordsFailure, updatedAt: Date?)
}

/// The line over «Записи»: «Обновляю…», «Обновлено 5 мин назад», «Нет связи · обновлено в 14:32». A pure function of
/// the moment, so the screen redraws it with the clock (`TimelineView`) while the list stays as it is (decision FT-220).
enum RecordsCaption {
    /// Up to an hour the age is in minutes; from then on — the clock.
    static let minutesUpTo: TimeInterval = 60 * 60

    static func text(_ status: RecordsStatus?, now: Date, calendar: Calendar) -> String? {
        switch status {
        case nil:
            return nil
        case .refreshing:
            return "Обновляю…"
        case let .updated(moment):
            return "Обновлено \(age(moment, now: now, calendar: calendar))"
        case let .stale(problem, updatedAt):
            guard let reason = reason(problem) else { return nil }
            guard let updatedAt else { return reason }
            // Without a network the clock, as before FT-254: «Нет связи · обновлено в 14:32»
            return "\(reason) · обновлено \(when(updatedAt, now: now, calendar: calendar))"
        }
    }

    /// «только что», «25 мин назад», then «в 14:32». A moment ahead of the phone's clock is «только что».
    private static func age(_ moment: Date, now: Date, calendar: Calendar) -> String {
        let seconds = now.timeIntervalSince(moment)
        guard seconds < minutesUpTo else { return when(moment, now: now, calendar: calendar) }
        let minutes = Int(max(seconds, 0) / 60)
        return minutes == 0 ? "только что" : "\(minutes) мин назад"
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
