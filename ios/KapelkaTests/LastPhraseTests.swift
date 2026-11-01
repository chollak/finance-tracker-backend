import Foundation
import Testing
@testable import Kapelka

/// The card «Последняя фраза» on «Записать» (FT-252): «Услышал: …» → «Отправляю…» → what became of each record of the
/// phrase, from the queue's answer (FT-255). Only phrases: a payment answers with a haptic and a notification.
@Suite("Записать: карточка последней фразы")
struct LastPhraseTests {
    private static let tashkent = TimeZone(identifier: "Asia/Tashkent")!
    /// 2026-10-29 14:32:05 in Tashkent.
    private static let inputTime = Date(timeIntervalSince1970: 1_793_266_325)
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = tashkent
        return calendar
    }()

    private func phrase(
        _ text: String,
        _ state: Capture.State = .pending,
        attempts: Int = 0,
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
        capture.attempts = attempts
        capture.reply = reply
        capture.rejection = rejection
        return capture
    }

    private func written(_ text: String, body: String, minutesLater: Double = 0) throws -> Capture {
        phrase(text, .sent, attempts: 1, reply: try CaptureReplyBodies.reply(body), minutesLater: minutesLater)
    }

    private func payment(minutesLater: Double = 1) -> Capture {
        let input = PaymentInput(amount: "28\u{00A0}000,00\u{00A0}UZS", merchant: "Shop", card: "TBC Uzbekistan")
        var capture = Capture(
            clientId: UUID(),
            text: "",
            capturedAt: Self.inputTime.addingTimeInterval(minutesLater * 60),
            timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment.from(input).payment
        )
        capture.state = .sent
        capture.attempts = 1
        capture.reply = CaptureReply(status: "saved", title: "Записал", summary: "Shop · 28 000 сум")
        return capture
    }

    private func state(_ captures: [Capture], change: (inout QueueState) -> Void = { _ in }) -> QueueState {
        var state = QueueState()
        state.captures = captures
        change(&state)
        return state
    }

    private func card(
        _ state: QueueState,
        configured: Bool = true,
        marks: LastPhraseMarks? = nil,
        accountNames: [String: String] = [:],
        undoing: Set<String> = [],
        deleting: Bool = false,
        saving: String? = nil,
        note: LastPhrase.Note? = nil,
        now: Date = inputTime
    ) -> LastPhrase? {
        LastPhrase.of(state, LastPhrase.Context(
            configured: configured,
            marks: marks,
            accountNames: accountNames,
            undoing: undoing,
            deleting: deleting,
            saving: saving,
            note: note,
            now: now,
            calendar: Self.calendar
        ))
    }

    private func texts(_ card: LastPhrase?) -> [String] {
        card?.lines.map(\.text) ?? []
    }

    // MARK: The way to the server

    @Test("фраза на телефоне — «Услышал: …» и «Отправляю…»; кнопки «Удалить» нет")
    func sending() throws {
        let capture = phrase("кофе 25к")
        let shown = try #require(card(state([capture])))

        #expect(shown.id == capture.clientId)
        #expect(shown.heard == "Услышал: кофе 25к")
        #expect(shown.lines.map(\.kind) == [.sending])
        #expect(texts(shown) == ["Отправляю…"])
        #expect(shown.deletion == nil)
    }

    @Test("запрос в пути — её или записи перед ней — «Отправляю…» без «Удалить»")
    func requestOut() throws {
        let older = phrase("такси 18к")
        let capture = phrase("кофе 25к", attempts: 1, minutesLater: 1)
        for sending in [capture.clientId, older.clientId] {
            let shown = try #require(card(state([older, capture]) { $0.sendingId = sending; $0.wait = .offline }))
            #expect(shown.id == capture.clientId)
            #expect(texts(shown) == ["Отправляю…"])
            #expect(shown.deletion == nil)
        }
    }

    @Test("голос ещё пишет фразу на телефон — уже «Услышал» и «Отправляю…»")
    func voiceSaving() throws {
        let older = try written("кофе 45", body: CaptureReplyBodies.coffee)
        let shown = try #require(card(state([older]), saving: "такси 18к"))

        #expect(shown.id == nil)
        #expect(shown.heard == "Услышал: такси 18к")
        #expect(texts(shown) == ["Отправляю…"])

        // The queue has it already: the card is the queue's
        let added = phrase("такси 18к", minutesLater: 1)
        #expect(card(state([older, added]), saving: "такси 18к")?.id == added.clientId)
    }

    @Test(
        "ждёт: нет связи, сервер не ответил — «Удалить» с телефона и «Отправить сейчас»",
        arguments: [
            (QueueWait.offline, "Нет связи — уйдёт, когда появится сеть", LastPhrase.Line.Kind.offline),
            (.noAnswer, "Сервер не ответил — уйдёт позже", .noAnswer),
        ]
    )
    func waiting(wait: QueueWait, text: String, kind: LastPhrase.Line.Kind) throws {
        let capture = phrase("кофе 25к", attempts: 1)
        let shown = try #require(card(state([capture]) { $0.wait = wait }))

        #expect(texts(shown) == [text])
        #expect(shown.lines.map(\.kind) == [kind])
        #expect(shown.deletion == .fromPhone(capture.clientId))
        #expect(shown.offersSendNow)
        #expect(!shown.opensSettings)
    }

    @Test("в очереди за записью, которая не ушла, — та же причина")
    func waitingBehindAnother() throws {
        let older = phrase("такси 18к", attempts: 2)
        let capture = phrase("кофе 25к", minutesLater: 1)
        #expect(texts(card(state([older, capture]) { $0.wait = .offline })) == ["Нет связи — уйдёт, когда появится сеть"])
    }

    @Test("ушла раньше, причины нет (файл до FT-252) — «Сервер не ответил — уйдёт позже»")
    func waitingWithoutReason() {
        #expect(texts(card(state([phrase("кофе 25к", attempts: 1)]))) == ["Сервер не ответил — уйдёт позже"])
    }

    @Test("429 — «Сервер просит подождать — уйдёт в 14:47»; пауза прошла — «Отправляю…»")
    func busy() throws {
        let capture = phrase("кофе 25к", attempts: 1)
        let pause = state([capture]) {
            $0.wait = .busy
            $0.notBefore = Self.inputTime.addingTimeInterval(15 * 60)
        }
        let shown = try #require(card(pause))
        #expect(texts(shown) == ["Сервер просит подождать — уйдёт в 14:47"])
        #expect(shown.lines.map(\.kind) == [.busy])
        #expect(shown.deletion == .fromPhone(capture.clientId))
        // The queue sends by itself when the pause is over
        #expect(!shown.offersSendNow)

        #expect(texts(card(pause, now: Self.inputTime.addingTimeInterval(16 * 60))) == ["Отправляю…"])
    }

    @Test("нет адреса и токена, токен не принят — с кнопкой «Настройки»")
    func settings() throws {
        let capture = phrase("кофе 25к")
        let unset = try #require(card(state([capture]), configured: false))
        #expect(texts(unset) == ["Укажи адрес и токен"])
        #expect(unset.lines.map(\.kind) == [.notConfigured])
        #expect(unset.opensSettings)
        #expect(!unset.offersSendNow)
        #expect(unset.deletion == .fromPhone(capture.clientId))

        let refused = try #require(card(state([phrase("кофе 25к", attempts: 1)]) { $0.tokenRefused = true }))
        #expect(texts(refused) == ["Сервер не принял токен"])
        #expect(refused.lines.map(\.kind) == [.tokenRefused])
        #expect(refused.opensSettings)
        #expect(!refused.offersSendNow)
    }

    // MARK: What the server wrote

    @Test("записал — «Записал: заметка · категория · сумма · счёт»; нажатие открывает запись; «Удалить» на сервере")
    func wrote() throws {
        let capture = try written("кофе 45", body: CaptureReplyBodies.coffee)
        let shown = try #require(card(state([capture])))
        let line = try #require(shown.lines.first)

        #expect(shown.heard == "Услышал: кофе 45")
        #expect(texts(shown) == ["Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"])
        #expect(line.kind == .written)
        #expect(line.explanation == nil)
        #expect(line.record == CaptureReplyBodies.coffeeId)
        #expect(line.opens == OpenTarget(.records, record: CaptureReplyBodies.coffeeId))
        #expect(shown.deletion == .onServer([RecordsNotice.Item(id: CaptureReplyBodies.coffeeId, title: "кофе")]))
        #expect(shown.footnote == nil)
        #expect(!shown.offersSendNow)
    }

    @Test("две записи фразы — по строке на каждую, заметка их различает; «Удалить» — обе")
    func twoRecords() throws {
        let capture = try written("хлеб 5к и бензин 200к картой", body: CaptureReplyBodies.breadAndPetrol)
        let shown = try #require(card(state([capture])))

        #expect(texts(shown) == [
            "Записал: хлеб · Продукты? · −5\u{00A0}000\u{00A0}сум · Карта",
            "Записал: бензин · Транспорт · −200\u{00A0}000\u{00A0}сум · Карта",
        ])
        #expect(shown.deletion == .onServer([
            RecordsNotice.Item(id: "c4b400f6-62a2-4fd0-8624-b71d7dcd23fa", title: "хлеб"),
            RecordsNotice.Item(id: "9df8b6e3-e460-4377-83cb-8c31806cf31b", title: "бензин"),
        ]))
    }

    @Test("«кофе 25к, такси» — «Записал: кофе…» и «Без суммы, не записал: такси — скажи с суммой»")
    func withoutAmount() throws {
        let capture = try written("кофе 25к, такси", body: CaptureReplyBodies.coffeeAndTaxiWithoutAmount)
        let shown = try #require(card(state([capture])))

        #expect(texts(shown) == [
            "Записал: кофе · Кафе · −25\u{00A0}000\u{00A0}сум · Карта",
            "Без суммы, не записал: такси — скажи с суммой",
        ])
        #expect(shown.lines.map(\.kind) == [.written, .withoutAmount])
        #expect(shown.lines.last?.record == nil)
    }

    @Test("«проверь» — «Записал, проверь: …» и «Что я предположил»")
    func review() throws {
        let capture = try written("кофе 25к и наушники 55$", body: CaptureReplyBodies.coffeeAndHeadphones)
        let shown = try #require(card(state([capture])))
        let headphones = try #require(shown.lines.last)

        #expect(texts(shown) == [
            "Записал: кофе · Кафе · −25\u{00A0}000\u{00A0}сум · Карта",
            "Записал, проверь: наушники · Покупки? · −55,00\u{00A0}USD · Карта",
        ])
        #expect(headphones.kind == .review)
        #expect(headphones.explanation == .assumed([
            "Категорию «Покупки» выбрал сам",
            "Счёт «Карта» — по умолчанию",
            "Доллары — на сумовом счёте: долларового нет",
        ]))
        #expect(headphones.record == "rec-headphones")
        #expect(shown.lines.first?.explanation == nil)
    }

    @Test("«проверь» без догадок — общая фраза сервера")
    func reviewWithoutGuesses() throws {
        let record = CapturedRecord(
            id: "rec-1", type: .expense, amountMinor: 50_000_000, currency: "UZS", categoryId: "cat-transfer",
            category: "Переводы", accountId: "acc-card", accountName: "Карта", description: "вернули",
            needsReview: true, assumptions: [], deletedAt: nil
        )
        let reply = CaptureReply(status: "needs_review", title: "Нужно проверить", summary: "…", records: [record])
        let shown = try #require(card(state([phrase("вернули 500к", .sent, attempts: 1, reply: reply)])))

        #expect(texts(shown) == ["Записал, проверь: вернули · Переводы · −500\u{00A0}000\u{00A0}сум · Карта"])
        #expect(shown.lines.first?.explanation == .unsure)
    }

    // MARK: After a lost answer (FT-255)

    private static func repeated(needsReview: Bool = false, deletedAt: String? = nil) -> CaptureReply {
        let record = CapturedRecord(
            id: CaptureReplyBodies.coffeeId, type: .expense, amountMinor: 4_500_000, currency: "UZS",
            categoryId: "637c7a38-2079-4094-a0dd-c40c5d36c211", category: "Кафе",
            accountId: "26da76bc-f575-46c8-74d7-8ffd3e562694", accountName: nil, description: "кофе",
            needsReview: needsReview, assumptions: [], deletedAt: deletedAt
        )
        return CaptureReply(
            status: "saved", title: "Записал", summary: "Кофе · 45 000 сум · Кафе", records: [record], repeated: true
        )
    }

    @Test("повтор после потерянного ответа — без счёта, пока имён счетов нет; со счётом по accountId; «без суммы» не утверждается")
    func afterLostAnswer() throws {
        let capture = phrase("кофе 45", .sent, attempts: 2, reply: Self.repeated())
        let bare = try #require(card(state([capture])))

        #expect(texts(bare) == ["Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум"])
        #expect(bare.footnote == "Первый ответ потерялся — не знаю, было ли что-то без суммы")
        #expect(bare.lines.first?.record == CaptureReplyBodies.coffeeId)

        let named = try #require(card(state([capture]), accountNames: ["26da76bc-f575-46c8-74d7-8ffd3e562694": "Карта"]))
        #expect(texts(named) == ["Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"])
    }

    @Test("повтор с «проверь» — без «Что я предположил», общая фраза")
    func afterLostAnswerReview() throws {
        let shown = try #require(card(state([phrase("кофе 45", .sent, attempts: 2, reply: Self.repeated(needsReview: true))])))
        #expect(texts(shown) == ["Записал, проверь: кофе · Кафе · −45\u{00A0}000\u{00A0}сум"])
        #expect(shown.lines.first?.explanation == .unsure)
    }

    /// A repeat while the first request is still written: the server waits for it and gives its whole answer, with
    /// `repeated: true` (`quickCaptureService.ts`, `once`).
    private static func repeatedWhole(_ body: String) throws -> CaptureReply {
        let whole = try CaptureReplyBodies.reply(body)
        return CaptureReply(
            status: whole.status, title: whole.title, summary: whole.summary,
            records: whole.records, withoutAmount: whole.withoutAmount, repeated: true
        )
    }

    @Test("повтор во время первого запроса — ответ целый: «без суммы» и догадки показаны, сноски нет")
    func repeatWhileFirstIsWritten() throws {
        let taxi = phrase("кофе 25к, такси", .sent, attempts: 2, reply: try Self.repeatedWhole(CaptureReplyBodies.coffeeAndTaxiWithoutAmount))
        let withoutAmount = try #require(card(state([taxi])))
        #expect(texts(withoutAmount).last == "Без суммы, не записал: такси — скажи с суммой")
        #expect(withoutAmount.footnote == nil)

        let headphones = phrase(
            "кофе 25к и наушники 55$", .sent, attempts: 2, reply: try Self.repeatedWhole(CaptureReplyBodies.coffeeAndHeadphones)
        )
        let review = try #require(card(state([headphones])))
        #expect(review.lines.last?.explanation == .assumed([
            "Категорию «Покупки» выбрал сам",
            "Счёт «Карта» — по умолчанию",
            "Доллары — на сумовом счёте: долларового нет",
        ]))
        #expect(review.footnote == nil)
    }

    @Test("удалена на сервере до повтора — «Удалено», без «Удалить» и без перехода")
    func deletedBeforeRepeat() throws {
        let capture = try written("кофе 45", body: CaptureReplyBodies.coffeeRepeated)
        let shown = try #require(card(state([capture]), accountNames: ["26da76bc-f575-46c8-74d7-8ffd3e562694": "Карта"]))

        #expect(texts(shown) == ["Удалено: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"])
        #expect(shown.lines.map(\.kind) == [.deleted])
        #expect(shown.lines.first?.record == nil)
        #expect(shown.deletion == nil)
    }

    @Test("одна из двух удалена до повтора — «Удалить» только для оставшейся")
    func oneOfTwoDeletedBeforeRepeat() throws {
        let capture = try written("хлеб 5к и бензин 200к картой", body: CaptureReplyBodies.breadAndPetrolRepeatedAfterDeletion)
        let shown = try #require(card(state([capture])))

        #expect(texts(shown) == [
            "Записал: хлеб · Продукты · −5\u{00A0}000\u{00A0}сум",
            "Удалено: бензин · Транспорт · −200\u{00A0}000\u{00A0}сум",
        ])
        #expect(shown.deletion == .onServer([RecordsNotice.Item(id: "c4b400f6-62a2-4fd0-8624-b71d7dcd23fa", title: "хлеб")]))
    }

    // MARK: Not written

    @Test("не нашёл операцию — подсказка с примером; без «Удалить»")
    func notFound() throws {
        let reply = CaptureReply(status: "no_transaction", title: "Не нашёл операцию", summary: "Не удалось распознать сумму или операцию")
        let shown = try #require(card(state([phrase("привет", .sent, attempts: 1, reply: reply)])))

        #expect(texts(shown) == ["Не нашёл операцию — скажи с суммой, например: „кофе 25 тысяч“"])
        #expect(shown.lines.map(\.kind) == [.notFound])
        #expect(shown.deletion == nil)
    }

    @Test("только без суммы — «Без суммы, не записал: такси — скажи с суммой», а не «не нашёл»")
    func onlyWithoutAmount() throws {
        let reply = CaptureReply(
            status: "no_transaction", title: "Не нашёл операцию", summary: "…",
            withoutAmount: [CapturedWithoutAmount(description: "такси", category: "Транспорт")]
        )
        let shown = try #require(card(state([phrase("такси", .sent, attempts: 1, reply: reply)])))
        #expect(texts(shown) == ["Без суммы, не записал: такси — скажи с суммой"])
    }

    @Test("сервер отказал (400) — «Не записал: причина»")
    func refused() throws {
        let capture = phrase("кофе 25к", .rejected, attempts: 1, rejection: "capturedAt is older than 30 days")
        let shown = try #require(card(state([capture])))

        #expect(texts(shown) == ["Не записал: старше 30 дней — сервер такие не берёт, запиши в Mini App"])
        #expect(shown.lines.map(\.kind) == [.refused])
        #expect(shown.deletion == nil)
    }

    @Test("сервер до FT-255 — итог ack, без перехода и без «Удалить»")
    func ackOnly() throws {
        let reply = CaptureReply(status: "saved", title: "Записал", summary: "Кофе · 25 000 сум")
        let shown = try #require(card(state([phrase("кофе 25к", .sent, attempts: 1, reply: reply)])))

        #expect(texts(shown) == ["Записал: Кофе · 25 000 сум"])
        #expect(shown.lines.first?.record == nil)
        #expect(shown.deletion == nil)
    }

    // MARK: Deleted

    @Test("удалено на сервере — «Удалено» только когда плашка с «Вернуть» ушла")
    func deletedAfterTheBar() throws {
        let capture = try written("кофе 45", body: CaptureReplyBodies.coffee)
        let marks = LastPhraseMarks(clientId: capture.clientId, deleted: [CaptureReplyBodies.coffeeId])

        let offered = try #require(card(state([capture]), marks: marks, undoing: [CaptureReplyBodies.coffeeId]))
        #expect(texts(offered) == ["Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"])
        #expect(offered.lines.first?.record == nil)
        #expect(offered.deletion == nil)

        let final = try #require(card(state([capture]), marks: marks))
        #expect(texts(final) == ["Удалено: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"])
        #expect(final.deletion == nil)
    }

    @Test("отметки другой фразы не действуют")
    func marksOfAnotherPhrase() throws {
        let capture = try written("кофе 45", body: CaptureReplyBodies.coffee)
        let marks = LastPhraseMarks(clientId: UUID(), deleted: [CaptureReplyBodies.coffeeId])
        #expect(texts(card(state([capture]), marks: marks)) == ["Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"])
    }

    @Test("удаление в пути — без кнопки")
    func deleting() throws {
        let capture = try written("кофе 45", body: CaptureReplyBodies.coffee)
        #expect(card(state([capture]), deleting: true)?.deletion == nil)
    }

    @Test("удалена с телефона, пока ждала, — «Удалено с телефона»; новая фраза — уже она")
    func removedFromPhone() throws {
        let older = try written("кофе 45", body: CaptureReplyBodies.coffee)
        let removedId = UUID()
        let removed = LastPhraseMarks(
            clientId: removedId,
            removed: .init(text: "такси 18к", capturedAt: Self.inputTime.addingTimeInterval(60), triedBefore: false)
        )
        let shown = try #require(card(state([older]), marks: removed))

        #expect(shown.id == removedId)
        #expect(shown.heard == "Услышал: такси 18к")
        #expect(texts(shown) == ["Удалено с телефона"])
        #expect(shown.lines.map(\.kind) == [.deleted])
        #expect(shown.deletion == nil)

        let tried = LastPhraseMarks(
            clientId: removedId,
            removed: .init(text: "такси 18к", capturedAt: Self.inputTime.addingTimeInterval(60), triedBefore: true)
        )
        #expect(texts(card(state([older]), marks: tried)) == ["Удалено с телефона — она уже уходила на сервер, проверь «Записи»"])

        let newer = phrase("обед 60к", minutesLater: 2)
        #expect(card(state([older, newer]), marks: removed)?.heard == "Услышал: обед 60к")
    }

    @Test("заметка «Уже отправляется» — только пока её запрос в пути; не дошёл — заметки нет, «Удалить» снова работает")
    func note() throws {
        let capture = phrase("кофе 25к", attempts: 1)
        let note = LastPhrase.Note(
            clientId: capture.clientId, text: "Уже отправляется — удалить можно, когда запишется", whileSending: true
        )
        #expect(card(state([capture]) { $0.sendingId = capture.clientId }, note: note)?.note == note.text)

        // The request timed out: the note would contradict «Сервер не ответил» and the working «Удалить»
        let timedOut = try #require(card(state([capture]) { $0.wait = .noAnswer }, note: note))
        #expect(timedOut.note == nil)
        #expect(timedOut.deletion == .fromPhone(capture.clientId))

        // The phone's own failure stays while the phrase waits
        let closed = LastPhrase.Note(clientId: capture.clientId, text: "Не удалилось: очередь на телефоне пока закрыта")
        #expect(card(state([capture]) { $0.wait = .noAnswer }, note: closed)?.note == closed.text)

        let sent = try written("кофе 45", body: CaptureReplyBodies.coffee)
        #expect(card(state([sent]), note: LastPhrase.Note(clientId: sent.clientId, text: note.text))?.note == nil)
    }

    @Test("новая фраза после прошлой «нет связи» — «Отправляю…», а не прежняя причина")
    func newPhraseAfterOldReason() throws {
        let capture = phrase("кофе 25к")
        let shown = try #require(card(state([capture]) { $0.wait = .offline }))
        #expect(texts(shown) == ["Отправляю…"])
        #expect(!shown.offersSendNow)
    }

    @Test("конец карточки для прокрутки над клавиатурой — её последняя строка")
    func end() throws {
        let written = try written("кофе 45", body: CaptureReplyBodies.coffee)
        #expect(LastPhraseSection.end(of: try #require(card(state([written])))) == "last-phrase-delete")

        let waiting = phrase("кофе 25к", attempts: 1)
        let pause = state([waiting]) { $0.wait = .busy; $0.notBefore = Self.inputTime.addingTimeInterval(600) }
        #expect(LastPhraseSection.end(of: try #require(card(pause))) == "last-phrase-delete")
        #expect(LastPhraseSection.end(of: try #require(card(state([phrase("кофе 25к")])))) == "way")

        let notFound = phrase(
            "привет", .sent, attempts: 1,
            reply: CaptureReply(status: "no_transaction", title: "Не нашёл операцию", summary: "…")
        )
        #expect(LastPhraseSection.end(of: try #require(card(state([notFound])))) == "not-found")

        let gone = try self.written("кофе 45", body: CaptureReplyBodies.coffeeRepeated)
        #expect(LastPhraseSection.end(of: try #require(card(state([gone])))) == "last-phrase-footnote")
    }

    @Test("исход сменился или фраза новая — `progress` другой; тот же исход — тот же")
    func progress() throws {
        let capture = phrase("кофе 45")
        let sending = try #require(card(state([capture])))
        #expect(card(state([capture]))?.progress == sending.progress)

        var answered = capture
        answered.state = .sent
        answered.attempts = 1
        answered.reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffee)
        let wrote = try #require(card(state([answered])))
        #expect(wrote.progress != sending.progress)

        let another = phrase("кофе 45", minutesLater: 1)
        #expect(card(state([capture, another]))?.progress != sending.progress)
    }

    // MARK: Only phrases

    @Test("только фразы: оплата после фразы карточку не меняет; одни оплаты — карточки нет")
    func onlyPhrases() throws {
        let capture = try written("кофе 45", body: CaptureReplyBodies.coffee)
        #expect(card(state([capture, payment()]))?.id == capture.clientId)
        #expect(card(state([payment()])) == nil)
        #expect(card(state([])) == nil)
    }

    @Test("«Требует внимания» не повторяет фразу карточки; старые фразы и оплаты — там")
    func attentionWithoutTheCard() throws {
        let older = phrase("такси 18к", attempts: 1)
        var refusedPayment = payment(minutesLater: 2)
        refusedPayment.state = .rejected
        refusedPayment.attempts = 0
        refusedPayment.reply = nil
        let capture = phrase("кофе 25к", attempts: 1, minutesLater: 1)
        let queue = state([older, capture, refusedPayment]) { $0.wait = .offline }
        let shown = try #require(card(queue))

        let rows = CaptureRow.needingAttention(
            queue.captures, sendingId: nil, now: Self.inputTime, calendar: Self.calendar, excluding: shown.id
        )
        #expect(rows.map(\.id) == [refusedPayment.clientId, older.clientId])
    }
}
