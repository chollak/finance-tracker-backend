import Foundation
import Testing
@testable import Kapelka

/// The line over «Записи» (FT-220, FT-254): «Обновляю…» while it refreshes by itself, then how old the list is —
/// «только что», «N мин назад» up to an hour, the clock after it; without a network «Нет связи · обновлено в 14:32».
@Suite("Записи: подпись над списком")
struct RecordsCaptionTests {
    /// 14:32:05 in Tashkent.
    private static let now = TestClock().now

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        return calendar
    }

    private func caption(_ status: RecordsStatus?) -> String? {
        RecordsCaption.text(status, now: Self.now, calendar: calendar)
    }

    private func ago(_ seconds: TimeInterval) -> Date {
        Self.now.addingTimeInterval(-seconds)
    }

    private func stale(_ problem: RecordsFailure, updatedHoursAgo hours: Double? = 0) -> String? {
        caption(.stale(problem, updatedAt: hours.map { ago($0 * 3600) }))
    }

    @Test("обновляется само — «Обновляю…»")
    func refreshing() {
        #expect(caption(.refreshing) == "Обновляю…")
    }

    @Test("обновлено: меньше минуты — «только что», до часа — «N мин назад», с часа — время")
    func updated() {
        #expect(caption(.updated(Self.now)) == "Обновлено только что")
        #expect(caption(.updated(ago(59))) == "Обновлено только что")
        #expect(caption(.updated(ago(60))) == "Обновлено 1 мин назад")
        #expect(caption(.updated(ago(25 * 60 + 30))) == "Обновлено 25 мин назад")
        #expect(caption(.updated(ago(59 * 60 + 59))) == "Обновлено 59 мин назад")
        #expect(caption(.updated(ago(60 * 60))) == "Обновлено в 13:32")
        #expect(caption(.updated(ago(5 * 3600))) == "Обновлено в 09:32")
        #expect(caption(.updated(ago(24 * 3600))) == "Обновлено вчера в 14:32")
        #expect(caption(.updated(ago(72 * 3600))) == "Обновлено 26 октября в 14:32")
    }

    @Test("через полночь до часа — всё ещё «N мин назад»; часы телефона ушли назад — «только что»")
    func updatedEdges() {
        let night = Date(timeIntervalSince1970: 1_793_302_200) // 2026-10-30 00:30 in Tashkent
        let beforeMidnight = night.addingTimeInterval(-40 * 60)
        #expect(RecordsCaption.text(.updated(beforeMidnight), now: night, calendar: calendar) == "Обновлено 40 мин назад")
        #expect(caption(.updated(Self.now.addingTimeInterval(300))) == "Обновлено только что")
    }

    @Test("без связи — как раньше: «Нет связи · обновлено в 14:32», вчера, раньше; без кэша — без времени")
    func offline() {
        #expect(stale(.unreachable) == "Нет связи · обновлено в 14:32")
        #expect(stale(.unreachable, updatedHoursAgo: 0.5) == "Нет связи · обновлено в 14:02")
        #expect(stale(.unreachable, updatedHoursAgo: 24) == "Нет связи · обновлено вчера в 14:32")
        #expect(stale(.unreachable, updatedHoursAgo: 72) == "Нет связи · обновлено 26 октября в 14:32")
        #expect(stale(.unreachable, updatedHoursAgo: nil) == "Нет связи")
    }

    @Test("причина — своя; без настроек — экран, не подпись; нет состояния — нет подписи")
    func reasons() {
        #expect(stale(.tokenRefused) == "Сервер не принял токен · обновлено в 14:32")
        #expect(stale(.refused("Bad request")) == "Сервер не принял запрос · обновлено в 14:32")
        #expect(stale(.notConfigured) == nil)
        #expect(caption(nil) == nil)
    }
}
