import Foundation
import Testing
@testable import Kapelka

/// The list of recent records on the main screen and the line under the microphone (FT-161, «Как устроено»).
@Suite("Список записей")
struct CaptureListTests {
    private static let tashkent = TimeZone(identifier: "Asia/Tashkent")!
    /// 2026-10-29 14:32:05 in Tashkent.
    private static let inputTime = Date(timeIntervalSince1970: 1_793_266_325)

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Self.tashkent
        return calendar
    }

    private func capture(
        _ text: String,
        _ state: Capture.State = .pending,
        reply: CaptureReply? = nil,
        rejection: String? = nil,
        minutesLater: Double = 0
    ) -> Capture {
        var capture = Capture(
            clientId: UUID(),
            text: text,
            capturedAt: Self.inputTime.addingTimeInterval(minutesLater * 60),
            timeZoneIdentifier: "Asia/Tashkent"
        )
        capture.state = state
        capture.reply = reply
        capture.rejection = rejection
        return capture
    }

    private func rows(
        _ captures: [Capture],
        sendingId: UUID? = nil,
        now: Date = inputTime.addingTimeInterval(3600)
    ) -> [CaptureRow] {
        CaptureRow.rows(captures, sendingId: sendingId, now: now, calendar: calendar)
    }

    @Test("ждёт — время ввода и фраза; удалить можно")
    func waiting() throws {
        let row = try #require(rows([capture("кофе 25 тысяч")]).first)

        #expect(row.kind == .waiting)
        #expect(row.status == "Ждёт · 14:32")
        #expect(row.text == "кофе 25 тысяч")
        #expect(row.canDelete)
    }

    @Test("запрос в пути — «Отправляю», удалить нельзя")
    func sending() throws {
        let waiting = capture("кофе 25 тысяч")
        let row = try #require(rows([waiting], sendingId: waiting.clientId).first)

        #expect(row.kind == .sending)
        #expect(row.status == "Отправляю · 14:32")
        #expect(row.text == "кофе 25 тысяч")
        #expect(row.canDelete == false)
    }

    @Test(
        "ответ сервера: записано, нужно проверить, не нашёл операцию",
        arguments: [
            ("saved", "Записал", "Кофе · 25 000 сум", CaptureRow.Kind.saved, "Записал · 14:32", "Кофе · 25 000 сум"),
            (
                "needs_review", "Нужно проверить", "Перевел · 500 000 сум",
                .needsReview, "Нужно проверить · 14:32", "Перевел · 500 000 сум"
            ),
            (
                "no_transaction", "Не нашёл операцию", "Не удалось распознать сумму или операцию",
                .notFound, "Не нашёл операцию · 14:32", "привет"
            ),
        ]
    )
    func answered(status: String, title: String, summary: String, kind: CaptureRow.Kind, shown: String, text: String) throws {
        let reply = CaptureReply(status: status, title: title, summary: summary)
        let row = try #require(rows([capture("привет", .sent, reply: reply)]).first)

        #expect(row.kind == kind)
        #expect(row.status == shown)
        #expect(row.text == text)
        #expect(row.canDelete == false)
    }

    @Test("ошибка — фраза и причина по-русски")
    func rejected() throws {
        let row = try #require(rows([capture("кофе 25к", .rejected, rejection: "capturedAt is older than 30 days")]).first)

        #expect(row.kind == .error)
        #expect(row.status == "Ошибка · 14:32")
        #expect(row.text == "кофе 25к")
        #expect(row.reason == "старше 30 дней — сервер такие не берёт, запиши в Mini App")
        #expect(row.canDelete == false)
    }

    private func payment(
        _ state: Capture.State = .pending,
        merchant: String? = "Ooo Mazzali Super Food",
        reply: CaptureReply? = nil,
        rejection: String? = nil,
        attempts: Int = 0
    ) -> Capture {
        let input = PaymentInput(amount: "28\u{00A0}000,00\u{00A0}UZS", merchant: merchant, card: "TBC Uzbekistan")
        var capture = Capture(
            clientId: UUID(),
            text: "",
            capturedAt: Self.inputTime,
            timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment.from(input).payment
        )
        capture.state = state
        capture.reply = reply
        capture.rejection = rejection
        capture.attempts = attempts
        return capture
    }

    @Test("оплата ждёт — магазин и сумма как в Wallet, пометка Apple Pay; удалить можно")
    func waitingPayment() throws {
        let row = try #require(rows([payment()]).first)

        #expect(row.kind == .waiting)
        #expect(row.status == "Ждёт · 14:32 · Apple Pay")
        #expect(row.text == "Ooo Mazzali Super Food · 28\u{00A0}000,00\u{00A0}UZS")
        #expect(row.canDelete)
    }

    @Test("оплата без магазина")
    func paymentWithoutMerchant() throws {
        let row = try #require(rows([payment(merchant: nil)]).first)
        #expect(row.text == "Оплата Apple Pay · 28\u{00A0}000,00\u{00A0}UZS")
    }

    @Test("оплата без суммы (команду запустили не из Wallet) — без висящей точки")
    func paymentWithoutAmount() throws {
        let input = PaymentInput(amount: nil, merchant: "Shop")
        var bare = Capture(
            clientId: UUID(),
            text: "",
            capturedAt: Self.inputTime,
            timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment.from(input).payment
        )
        bare.state = .rejected
        let empty = Capture(
            clientId: UUID(),
            text: "",
            capturedAt: Self.inputTime,
            timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment.from(PaymentInput()).payment
        )

        #expect(rows([bare]).first?.text == "Shop")
        #expect(rows([empty]).first?.text == "Оплата Apple Pay")
    }

    @Test("оплата записана — итог сервера, как у фразы")
    func savedPayment() throws {
        let reply = CaptureReply(status: "needs_review", title: "Нужно проверить", summary: "Ooo Mazzali Super Food · 28 000 сум · Кафе?")
        let row = try #require(rows([payment(.sent, reply: reply, attempts: 1)]).first)

        #expect(row.kind == .needsReview)
        #expect(row.status == "Нужно проверить · 14:32 · Apple Pay")
        #expect(row.text == "Ooo Mazzali Super Food · 28 000 сум · Кафе?")
    }

    @Test("оплата не ушла с телефона — «Не отправлено» и причина; ответ 400 — «Ошибка»")
    func refusedPayment() throws {
        let kept = try #require(rows([payment(.rejected, rejection: "валюта EUR — Kapelka пишет только сумы и доллары, запиши в Mini App")]).first)
        #expect(kept.kind == .error)
        #expect(kept.status == "Не отправлено · 14:32 · Apple Pay")
        #expect(kept.text == "Ooo Mazzali Super Food · 28\u{00A0}000,00\u{00A0}UZS")
        #expect(kept.reason == "валюта EUR — Kapelka пишет только сумы и доллары, запиши в Mini App")
        #expect(kept.canDelete == false)

        let refused = try #require(rows([payment(.rejected, rejection: "currency must be UZS or USD", attempts: 1)]).first)
        #expect(refused.status == "Ошибка · 14:32 · Apple Pay")
        #expect(refused.reason == "сервер пишет только сумы и доллары")
    }

    @Test("строка под микрофоном и для оплаты, не ушедшей с телефона")
    func statusLineForPayment() {
        var state = QueueState()
        state.captures = [payment(.rejected, rejection: "валюта EUR — Kapelka пишет только сумы и доллары, запиши в Mini App")]
        #expect(QueueStatus.line(for: state, configured: true) == "Не записано: валюта EUR — Kapelka пишет только сумы и доллары, запиши в Mini App")
    }

    @Test("новые сверху")
    func newestFirst() {
        let list = rows([capture("первая"), capture("вторая", minutesLater: 1), capture("третья", minutesLater: 2)])
        #expect(list.map(\.text) == ["третья", "вторая", "первая"])
    }

    @Test("не сегодня — с датой")
    func otherDay() throws {
        let row = try #require(rows([capture("кофе 25к")], now: Self.inputTime.addingTimeInterval(24 * 3600)).first)
        #expect(row.status.hasPrefix("Ждёт · 29 окт"))
        #expect(row.status.hasSuffix("14:32"))
    }

    @Test("строка под микрофоном: итог сервера или «в очереди N»")
    func statusLine() {
        let saved = capture("кофе", .sent, reply: CaptureReply(status: "saved", title: "Записал", summary: "Кофе · 25 000 сум"))
        var state = QueueState()
        state.captures = [saved]
        #expect(QueueStatus.line(for: state, configured: true) == "Записал · Кофе · 25 000 сум")

        state.captures.append(capture("такси"))
        state.captures.append(capture("обед"))
        #expect(QueueStatus.line(for: state, configured: true) == "В очереди: 2")
        #expect(QueueStatus.afterSending(state, configured: true) == "В очереди: 2 — сервер пока недоступен")

        state.captures = [capture("кофе", .rejected, rejection: "Text is too long (maximum 2000 characters)")]
        #expect(QueueStatus.line(for: state, configured: true) == "Не записано: длиннее 2000 символов")
        #expect(QueueStatus.afterSending(state, configured: true) == "Всё отправлено")

        state.tokenRefused = true
        #expect(QueueStatus.line(for: state, configured: true) == "Сервер не принял токен — проверь токен в настройках Kapelka")
        #expect(QueueStatus.line(for: state, configured: false) == "Укажи адрес и токен в настройках Kapelka")
    }
}
