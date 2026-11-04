import Foundation
import Testing
@testable import Kapelka

/// The journal's words (#241): what a step says, how long a run went, what «Поделиться» sends.
@Suite("Журнал команд: тексты")
struct JournalTextTests {
    private static let id = UUID(uuidString: "0B9C2F5E-1D3A-4E6B-8F70-123456789ABC")!

    private static func payment(_ state: Capture.State = .pending) -> Capture {
        var capture = Capture(
            clientId: id,
            text: "",
            capturedAt: Date(timeIntervalSince1970: 1_793_266_325),
            timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment(walletAmount: "12 345,00 UZS", amount: "12345.00", currency: "UZS", merchant: "Магазин у дома", card: "Карта")
        )
        capture.state = state
        return capture
    }

    private static func state(_ captures: [Capture], wait: QueueWait? = nil, tokenRefused: Bool = false) -> QueueState {
        var state = QueueState()
        state.captures = captures
        state.wait = wait
        state.tokenRefused = tokenRefused
        return state
    }

    @Test("в очереди: clientId, у оплаты — магазин и сумма, как их дал Wallet")
    func queued() {
        #expect(JournalText.queued(Self.payment()) == "в очереди · \(Self.id.uuidString) · Магазин у дома · 12 345,00 UZS")
        let phrase = Capture(clientId: Self.id, text: "кофе 25к", capturedAt: Date(), timeZoneIdentifier: "Asia/Tashkent")
        #expect(JournalText.queued(phrase) == "фраза в очереди · \(Self.id.uuidString)")
    }

    @Test(
        "итог отправки записи: записано, отказ, и почему ждёт — нет связи, не ответил, просит подождать, токен, не настроено",
        arguments: [
            (Capture.State.sent, nil as QueueWait?, false, true, "отправка: записано"),
            (.rejected, nil, false, true, "отправка: сервер отказал"),
            (.pending, .offline, false, true, "отправка: нет связи"),
            (.pending, .noAnswer, false, true, "отправка: сервер не ответил"),
            (.pending, .busy, false, true, "отправка: сервер просит подождать"),
            (.pending, nil, true, true, "отправка: токен не принят"),
            (.pending, .offline, false, false, "отправка: не настроено"),
            (.pending, nil, false, true, "отправка: не успела, уйдёт позже"),
        ]
    )
    func sent(state: Capture.State, wait: QueueWait?, tokenRefused: Bool, configured: Bool, text: String) {
        let queue = Self.state([Self.payment(state)], wait: wait, tokenRefused: tokenRefused)
        #expect(JournalText.sent(Self.id, queue, configured: configured) == text)
    }

    @Test("пауза 429 без причины в файле — «просит подождать»; записи уже нет — так и сказано")
    func sentEdges() {
        var paused = Self.state([Self.payment()])
        paused.notBefore = Date()
        #expect(JournalText.sent(Self.id, paused, configured: true) == "отправка: сервер просит подождать")
        #expect(JournalText.sent(UUID(), paused, configured: true) == "отправка: запись удалена")
    }

    @Test("«Отправить очередь»: нечего, всё ушло, сколько ждёт и почему")
    func queueSent() {
        let empty = QueueState()
        let waiting = Self.state([Self.payment()])
        #expect(JournalText.queueSent(before: empty, after: empty, configured: true) == "отправка: нечего отправлять")
        #expect(JournalText.queueSent(before: waiting, after: Self.state([Self.payment(.sent)]), configured: true)
            == "отправка: всё отправлено")
        #expect(JournalText.queueSent(before: waiting, after: Self.state([Self.payment()], wait: .offline), configured: true)
            == "отправка: ждут 1 — нет связи")
    }

    @Test("длительность: мс до секунды, потом десятые секунды, потом минуты")
    func duration() {
        #expect(JournalText.duration(ms: 0) == "0\u{00A0}мс")
        #expect(JournalText.duration(ms: 999) == "999\u{00A0}мс")
        #expect(JournalText.duration(ms: 1834) == "1,8\u{00A0}с")
        #expect(JournalText.duration(ms: 25_000) == "25,0\u{00A0}с")
        #expect(JournalText.duration(ms: 65_400) == "1\u{00A0}мин 5\u{00A0}с")
    }

    @Test("итог запуска: конец, ошибка, оборвана iOS с последним шагом, идёт")
    func outcome() {
        #expect(JournalText.outcome(.finished(ms: 1834)) == "конец · 1,8\u{00A0}с")
        #expect(JournalText.outcome(.failed(ms: 20, message: "очередь закрыта")) == "ошибка: очередь закрыта · 20\u{00A0}мс")
        #expect(JournalText.outcome(.interrupted(lastStep: "отправка: нет связи"))
            == "оборвана iOS после шага «отправка: нет связи»")
        #expect(JournalText.outcome(.going) == "идёт")
    }

    @Test("«Поделиться» — текстом: заголовок, запуски новые сверху, у каждого шаги со временем от начала")
    func shared() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        let start = Date(timeIntervalSince1970: 1_793_266_325)
        let runs = [
            JournalRun(
                id: UUID(),
                command: .recordPayment,
                startedAt: start.addingTimeInterval(60),
                steps: [.init(ms: 0, text: "начало"), .init(ms: 12, text: "в очереди · 1")],
                outcome: .interrupted(lastStep: "в очереди · 1")
            ),
            JournalRun(
                id: UUID(),
                command: .sendQueue,
                startedAt: start,
                steps: [.init(ms: 0, text: "начало")],
                outcome: .finished(ms: 2300)
            ),
        ]

        #expect(JournalText.shared(runs, calendar: calendar) == """
        Журнал команд Kapelka · запусков: 2, новые сверху

        29 окт., 14:33:05 · Записать оплату — оборвана iOS после шага «в очереди · 1»
          0\u{00A0}мс · начало
          12\u{00A0}мс · в очереди · 1

        29 окт., 14:32:05 · Отправить очередь — конец · 2,3\u{00A0}с
          0\u{00A0}мс · начало
        """)
    }
}
