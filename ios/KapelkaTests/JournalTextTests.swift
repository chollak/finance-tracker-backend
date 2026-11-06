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
        #expect(JournalText.duration(ms: 7_500_000) == "2\u{00A0}ч 5\u{00A0}мин")
        #expect(JournalText.exact(ms: 25_012) == "25012\u{00A0}мс")
    }

    @Test("начало запуска: холодный ли запуск и сколько от старта процесса")
    func launch() {
        #expect(JournalText.launch(JournalLaunch(cold: true, sinceProcessStartMs: 340))
            == "холодный запуск · 340\u{00A0}мс от старта процесса")
        #expect(JournalText.launch(JournalLaunch(cold: false, sinceProcessStartMs: 7_500_000))
            == "процесс уже работал · 2\u{00A0}ч 5\u{00A0}мин от старта процесса")
        #expect(JournalText.launch(JournalLaunch(cold: true, sinceProcessStartMs: nil)) == "холодный запуск")
    }

    @Test("сборка этого приложения и iOS — настоящие: версия, номер, время сборки; процесс знает свой старт")
    func thisBuild() throws {
        let build = AppBuild.current()
        #expect(build.version != "?")
        #expect(build.build != "?")
        #expect(build.system.hasPrefix("iOS "))
        #expect(build.builtAt != nil)
        let start = try #require(ProcessStart.date())
        #expect(start <= Date())
        #expect(start > Date().addingTimeInterval(-24 * 3600))
    }

    @Test("итог запуска: конец, ошибка, оборвана — приложение закрылось — с последним шагом, идёт")
    func outcome() {
        #expect(JournalText.outcome(.finished(ms: 1834)) == "конец · 1,8\u{00A0}с")
        #expect(JournalText.outcome(.failed(ms: 20, message: "очередь закрыта")) == "ошибка: очередь закрыта · 20\u{00A0}мс")
        #expect(JournalText.outcome(.interrupted(lastStep: "отправка: нет связи"))
            == "оборвана: приложение закрылось после шага «отправка: нет связи»")
        #expect(JournalText.outcome(.going) == "идёт")
    }

    @Test("«Записать трату» оборвана после «фраза в очереди» — фраза цела и уйдёт; до неё — без этих слов")
    func interruptedAfterPhrase() {
        let phrase = Capture(clientId: Self.id, text: "кофе 25к", capturedAt: Date(), timeZoneIdentifier: "Asia/Tashkent")
        let queued = JournalText.queued(phrase)
        #expect(JournalText.outcome(.interrupted(lastStep: queued))
            == "оборвана: приложение закрылось после шага «\(queued)», фраза цела и уйдёт сама")
        #expect(JournalText.outcome(.interrupted(lastStep: JournalText.pressed(.idle)))
            == "оборвана: приложение закрылось после шага «слушаю»")
        // A payment's queued step is the command's own: cut off there is what the journal hunts
        #expect(!JournalText.outcome(.interrupted(lastStep: JournalText.queued(Self.payment()))).contains("цела"))
    }

    @Test("VoiceOver: шаг — одна фраза «время — текст», UUID — первые 8 знаков")
    func spoken() {
        #expect(JournalText.spoken(JournalRun.Step(ms: 12, text: JournalText.queued(Self.payment())))
            == "12\u{00A0}мс — в очереди · 0B9C2F5E · Магазин у дома · 12 345,00 UZS")
        #expect(JournalText.spoken(JournalRun.Step(ms: 1834, text: "отправка: записано")) == "1,8\u{00A0}с — отправка: записано")
        #expect(JournalText.spoken("оборвана после шага «фраза в очереди · \(Self.id.uuidString.lowercased())»")
            == "оборвана после шага «фраза в очереди · 0b9c2f5e»")
    }

    private static let start = Date(timeIntervalSince1970: 1_793_266_325)

    private static var tashkent: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        return calendar
    }

    private static let runs = [
        JournalRun(
            id: UUID(),
            command: .recordPayment,
            startedAt: start.addingTimeInterval(60),
            steps: [.init(ms: 0, text: "начало"), .init(ms: 12, text: "в очереди · 1")],
            outcome: .interrupted(lastStep: "в очереди · 1"),
            launch: JournalLaunch(cold: true, sinceProcessStartMs: 340)
        ),
        JournalRun(
            id: UUID(),
            command: .sendQueue,
            startedAt: start,
            steps: [.init(ms: 0, text: "начало"), .init(ms: 25_012, text: "отправка: всё отправлено")],
            outcome: .finished(ms: 25_013)
        ),
    ]

    private static let build = AppBuild(version: "0.1", build: "7", system: "iOS 26.1", builtAt: start.addingTimeInterval(-3600))

    @Test("«Поделиться» — текстом: заголовок, запуски новые сверху, у каждого шаги со временем от начала")
    func shared() {
        #expect(JournalText.shared(Self.runs, dates: JournalDates(calendar: Self.tashkent), build: Self.build) == """
        Журнал команд Kapelka · запусков: 2, новые сверху
        Kapelka 0.1 (7), собрана 29 окт., 13:32 · iOS 26.1

        29 окт., 14:33:05 · Записать оплату — оборвана: приложение закрылось после шага «в очереди · 1»
          холодный запуск · 340\u{00A0}мс от старта процесса
          0\u{00A0}мс · начало
          12\u{00A0}мс · в очереди · 1

        29 окт., 14:32:05 · Отправить очередь — конец · 25013\u{00A0}мс
          0\u{00A0}мс · начало
          25012\u{00A0}мс · отправка: всё отправлено
        """)
    }

    @Test("экран журнала собирается раз на загрузку: заголовки запусков и текст «Поделиться» (#284)")
    func page() {
        let page = JournalPage(runs: Self.runs, calendar: Self.tashkent, build: Self.build)

        #expect(page.entries.map(\.run) == Self.runs)
        #expect(page.entries.map(\.title) == ["29 окт., 14:33:05 · Записать оплату", "29 окт., 14:32:05 · Отправить очередь"])
        #expect(page.shared == JournalText.shared(Self.runs, dates: JournalDates(calendar: Self.tashkent), build: Self.build))
        #expect(JournalPage(runs: [], calendar: Self.tashkent, build: Self.build).entries.isEmpty)
    }

    @Test("на экране длительность дольше секунды — в секундах, в «Поделиться» — в мс")
    func outcomeExact() {
        #expect(JournalText.outcome(.finished(ms: 1834)) == "конец · 1,8\u{00A0}с")
        #expect(JournalText.outcome(.finished(ms: 1834), exact: true) == "конец · 1834\u{00A0}мс")
        #expect(JournalText.outcome(.failed(ms: 1834, message: "x"), exact: true) == "ошибка: x · 1834\u{00A0}мс")
    }
}
