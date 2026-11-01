import Foundation
import Testing
@testable import Kapelka

/// What the notifications of a pass say (FT-253): one per pass for the phrases, one per payment, one for what was not
/// written, one for the token; «Записал: …» as the bot and the card of FT-252 say it, amounts by `MoneyText`.
@Suite("Уведомления: тексты")
struct NoticeTextTests {
    private static let at = Date(timeIntervalSince1970: 1_793_266_325)

    private func phrase(_ text: String, _ body: String) throws -> Capture {
        try CaptureReplyBodies.sentCapture(UUID(), text: text, body: body)
    }

    private func phrase(_ text: String, reply: CaptureReply) -> Capture {
        var capture = Capture(clientId: UUID(), text: text, capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent")
        capture.state = .sent
        capture.attempts = 1
        capture.reply = reply
        return capture
    }

    private func payment(_ body: String? = CaptureReplyBodies.paymentFromDocs, rejection: String? = nil) throws -> Capture {
        var capture = Capture(
            clientId: UUID(),
            text: "",
            capturedAt: Self.at,
            timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment(
                walletAmount: "25\u{00A0}000,00\u{00A0}UZS",
                amount: "25000.00",
                currency: "UZS",
                merchant: "KORZINKA 24",
                card: "TBC Uzbekistan"
            )
        )
        capture.attempts = 1
        if let rejection {
            capture.state = .rejected
            capture.rejection = rejection
        } else if let body {
            capture.state = .sent
            capture.reply = try CaptureReplyBodies.reply(body)
        }
        return capture
    }

    private func refused(_ text: String, _ rejection: String) -> Capture {
        var capture = Capture(clientId: UUID(), text: text, capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent")
        capture.state = .rejected
        capture.attempts = 1
        capture.rejection = rejection
        return capture
    }

    private func nothingFound(_ text: String, withoutAmount: [CapturedWithoutAmount] = []) -> Capture {
        phrase(text, reply: CaptureReply(
            status: "no_transaction",
            title: "Не нашёл операцию",
            summary: "Не удалось распознать сумму или операцию",
            withoutAmount: withoutAmount
        ))
    }

    private func record(
        _ description: String,
        _ category: String,
        minor: Int,
        type: Record.Kind = .expense,
        currency: String = "UZS",
        needsReview: Bool = false,
        assumptions: [CaptureAssumption] = []
    ) -> CapturedRecord {
        CapturedRecord(
            id: UUID().uuidString,
            type: type,
            amountMinor: minor,
            currency: currency,
            categoryId: nil,
            category: category,
            accountId: nil,
            accountName: "Карта",
            description: description,
            needsReview: needsReview,
            assumptions: assumptions,
            deletedAt: nil
        )
    }

    private func written(_ records: [CapturedRecord]) -> Capture {
        phrase("фраза", reply: CaptureReply(status: "saved", title: "Записал", summary: "", records: records))
    }

    private func amount(_ minor: Int, _ currency: String = "UZS") -> String {
        MoneyText.format(minor: minor, currency: currency, sign: .always)
    }

    private func notices(_ events: [QueueEvent]) -> [Notice] {
        NoticeText.notices(for: events)
    }

    // MARK: Written in the background

    @Test("одна запись — «Записал: заметка · категория · сумма», с переходом к ней во «Записях», id по фразе")
    func oneRecord() throws {
        let coffee = try phrase("кофе 45", CaptureReplyBodies.coffee)

        #expect(notices([.wrote([coffee])]) == [Notice(
            id: "wrote-\(coffee.clientId.uuidString)",
            body: "Записал: кофе · Кафе · \u{2212}45\u{00A0}000\u{00A0}сум",
            opens: .records,
            record: CaptureReplyBodies.coffeeId
        )])
    }

    @Test("три фразы прохода — одно уведомление «Записал 3 записи»")
    func threePhrasesOneNotice() throws {
        let pass = try [
            phrase("кофе 45", CaptureReplyBodies.coffee),
            phrase("такси 18к", CaptureReplyBodies.taxiFromDocs),
            phrase("кофе 25к, такси", CaptureReplyBodies.coffeeAndTaxiWithoutAmount),
        ]

        let posted = notices([.wrote(pass)])

        #expect(posted.map(\.body) == ["Записал 3 записи\nБез суммы, не записал: такси"])
        #expect(posted.map(\.id) == ["wrote-\(pass[0].clientId.uuidString)"])
        // Several records: the tab at the top, no record to scroll to (FT-254)
        #expect(posted.map(\.record) == [nil])
    }

    @Test("считаются записи, а не фразы: «хлеб и бензин» — две записи, одна к проверке")
    func countsRecords() throws {
        let bread = try phrase("хлеб 5к и бензин 200к картой", CaptureReplyBodies.breadAndPetrol)
        let headphones = try phrase("кофе 25к и наушники 55$", CaptureReplyBodies.coffeeAndHeadphones)

        #expect(notices([.wrote([bread])]).map(\.body) == ["Записал 2 записи"])
        #expect(notices([.wrote([headphones])]).map(\.body) == ["Записал 2 записи · 1 к проверке"])
        #expect(notices([.wrote([bread, headphones])]).map(\.body) == ["Записал 4 записи · 1 к проверке"])
    }

    @Test("запись, удалённая на сервере до повтора, не считается")
    func deletedNotCounted() throws {
        let repeated = try phrase("хлеб 5к и бензин 200к картой", CaptureReplyBodies.breadAndPetrolRepeatedAfterDeletion)

        // The repeat keeps no assumptions: «Продукты» without «?»
        #expect(notices([.wrote([repeated])]).map(\.body) == ["Записал: хлеб · Продукты · \(amount(-500_000))"])
    }

    @Test("записи без числа: 1 запись, 2 записи, 5 записей, 11 записей, 21 запись")
    func plural() {
        #expect(WrittenText.records(1) == "1 запись")
        #expect(WrittenText.records(2) == "2 записи")
        #expect(WrittenText.records(5) == "5 записей")
        #expect(WrittenText.records(11) == "11 записей")
        #expect(WrittenText.records(14) == "14 записей")
        #expect(WrittenText.records(21) == "21 запись")
        #expect(WrittenText.records(22) == "22 записи")
        #expect(WrittenText.records(25) == "25 записей")
        #expect(WrittenText.records(111) == "111 записей")
    }

    @Test("«проверь»: одна запись — «Записал, проверь: …», догаданная категория с «?»")
    func needsReview() {
        let headphones = record(
            "наушники", "Покупки", minor: 5_500, currency: "USD", needsReview: true,
            assumptions: [.category(name: "Покупки"), .currency(code: "USD", reason: .noUsdAccount)]
        )

        #expect(notices([.wrote([written([headphones])])]).map(\.body) == [
            "Записал, проверь: наушники · Покупки? · \(amount(-5_500, "USD"))",
        ])
    }

    @Test("строка записи: заметка, совпавшая с категорией, не повторяется; доход с «+»; без заметки — категория")
    func recordLine() {
        #expect(WrittenText.line(record("такси", "Такси", minor: 1_800_000)) == "Такси · \(amount(-1_800_000))")
        #expect(WrittenText.line(record("Ёлка", "елка", minor: 100)) == "елка · \(amount(-100))")
        #expect(WrittenText.line(record("", "Зарплата", minor: 500_000_000, type: .income)) == "Зарплата · +5\u{00A0}000\u{00A0}000\u{00A0}сум")
        #expect(WrittenText.line(record("  ", "", minor: 100)) == amount(-100))
    }

    @Test("ответ без записей (сервер до FT-255) — итог сервера")
    func ackOnly() throws {
        let saved = try phrase("кофе 25к", ServerReply.saved())
        let review = try phrase("долг", ServerReply.saved(status: "needs_review", title: "Записал долг", summary: "Долгов записано: 1"))

        #expect(notices([.wrote([saved])]).map(\.body) == ["Записал: Кофе · 25 000 сум"])
        #expect(notices([.wrote([review])]).map(\.body) == ["Записал, проверь: Долгов записано: 1"])
        #expect(notices([.wrote([saved, review])]).map(\.body) == ["Записал 2 записи · 1 к проверке"])
    }

    // MARK: Payments

    @Test("оплата — своё уведомление под её clientId: «Записал: KORZINKA 24 · Продукты? · −25 000 сум»")
    func paymentWritten() throws {
        let korzinka = try payment()

        #expect(notices([.wrote([korzinka])]) == [Notice(
            id: korzinka.clientId.uuidString,
            body: "Записал: KORZINKA 24 · Продукты? · \u{2212}25\u{00A0}000\u{00A0}сум",
            opens: .records,
            record: "ff1a09d9-b1d4-410a-9f8f-10f872ab580a"
        )])
    }

    @Test("проход с оплатой и фразами — уведомление оплаты и одно общее на фразы")
    func paymentAndPhrases() throws {
        let korzinka = try payment()
        let coffee = try phrase("кофе 45", CaptureReplyBodies.coffee)
        let taxi = try phrase("такси 18к", CaptureReplyBodies.taxiFromDocs)

        let posted = notices([.wrote([coffee, korzinka, taxi])])

        #expect(posted.map(\.id) == [korzinka.clientId.uuidString, "wrote-\(coffee.clientId.uuidString)"])
        #expect(posted.map(\.body) == [
            "Записал: KORZINKA 24 · Продукты? · \(amount(-2_500_000))",
            "Записал 2 записи",
        ])
    }

    @Test("две оплаты прохода — по уведомлению на каждую")
    func twoPayments() throws {
        let first = try payment()
        let second = try payment()

        #expect(notices([.wrote([first, second])]).map(\.id) == [first.clientId.uuidString, second.clientId.uuidString])
    }

    @Test("оплату отклонил сервер — «Не записал: магазин · сумма» и причина, под её clientId, переход на «Записать»")
    func paymentRefused() throws {
        let korzinka = try payment(rejection: "amount must be a decimal string")

        #expect(notices([.rejected([korzinka])]) == [Notice(
            id: korzinka.clientId.uuidString,
            body: "Не записал: KORZINKA 24 · 25\u{00A0}000,00\u{00A0}UZS\nСервер не понял сумму",
            opens: .capture
        )])
    }

    // MARK: Not written

    @Test("«Не нашёл операцию: «привет»» — с переходом на «Записать»")
    func nothingFoundOne() {
        let hello = nothingFound("привет")

        #expect(notices([.noOperation([hello])]) == [Notice(
            id: "failed-\(hello.clientId.uuidString)",
            body: "Не нашёл операцию: «привет»",
            opens: .capture
        )])
    }

    @Test("фраза только без суммы — «Без суммы, не записал: такси»")
    func onlyWithoutAmount() {
        let taxi = nothingFound("такси", withoutAmount: [CapturedWithoutAmount(description: "такси", category: "Транспорт")])

        #expect(notices([.noOperation([taxi])]).map(\.body) == ["Без суммы, не записал: такси"])
    }

    @Test("отказ 400 — «Не записал: «фраза»» и причина по-русски")
    func refusedOne() {
        let old = refused("кофе 25к", "capturedAt is older than 30 days")

        #expect(notices([.rejected([old])]).map(\.body) == [
            "Не записал: «кофе 25к»\nСтарше 30 дней — сервер такие не берёт, запиши в Mini App",
        ])
    }

    @Test("несколько незаписанных фраз прохода — одно уведомление со всеми")
    func severalFailed() {
        let hello = nothingFound("привет")
        let old = refused("кофе 25к", "capturedAt is older than 30 days")

        let posted = notices([.noOperation([hello]), .rejected([old])])

        #expect(posted.map(\.body) == ["Не записал 2 фразы: «привет», «кофе 25к»"])
        #expect(posted.map(\.opens) == [.capture])
    }

    @Test("длинная фраза — обрезана, переносы строк — пробелы")
    func longPhrase() {
        let long = nothingFound("купил\nв магазине у дома хлеб, молоко, сыр и ещё что-то")

        #expect(notices([.noOperation([long])]).map(\.body) == ["Не нашёл операцию: «купил в магазине у дома хлеб, молоко, с…»"])
    }

    // MARK: Token, queued

    @Test("токен не принят — уведомление с переходом в настройки")
    func token() {
        #expect(notices([.tokenRefused]) == [Notice(
            id: NoticeText.tokenId,
            body: "Сервер не принял токен — проверь токен в настройках Kapelka",
            opens: .settings
        )])
    }

    @Test("«в очереди» — без уведомления: «уйдёт позже» у оплаты пишет её команда")
    func queuedIsNoNews() throws {
        let waiting = Capture(clientId: UUID(), text: "кофе", capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent")

        #expect(notices([.queued([waiting])]).isEmpty)
        #expect(notices([]).isEmpty)
    }

    @Test("порядок в проходе: оплаты, записанные фразы, оплаты с отказом, незаписанные фразы, токен")
    func order() throws {
        let coffee = try phrase("кофе 45", CaptureReplyBodies.coffee)
        let korzinka = try payment()
        let refusedPayment = try payment(rejection: "amount must be a decimal string")
        let hello = nothingFound("привет")

        let posted = notices([.wrote([coffee, korzinka]), .noOperation([hello]), .rejected([refusedPayment]), .tokenRefused])

        #expect(posted.map(\.id) == [
            korzinka.clientId.uuidString,
            "wrote-\(coffee.clientId.uuidString)",
            refusedPayment.clientId.uuidString,
            "failed-\(hello.clientId.uuidString)",
            NoticeText.tokenId,
        ])
    }

    @Test("ответ на оплату: id, которые снимаются на экране, — только оплаты с ответом сервера")
    func answeredPayments() throws {
        let korzinka = try payment()
        let refusedPayment = try payment(rejection: "amount must be a decimal string")
        let coffee = try phrase("кофе 45", CaptureReplyBodies.coffee)

        #expect(NoticeText.answeredPaymentIds([.wrote([coffee, korzinka]), .rejected([refusedPayment]), .tokenRefused]) == [
            korzinka.clientId.uuidString,
            refusedPayment.clientId.uuidString,
        ])
    }
}
