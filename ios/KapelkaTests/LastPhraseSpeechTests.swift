import Foundation
import Testing
@testable import Kapelka

/// #285: VoiceOver hears what became of the phrase — the lines of the card «Последняя фраза», word for word, each once.
/// «Отправляю…» is no news, nor a line «Удалено: …» of the server (the bar «Удалено · Вернуть» answers that delete), nor
/// the card the screen opens with. Taken off the phone, the card says it itself — «Удалено с телефона», or the note why
/// it was not (#346). While the microphone is on nothing is said: VoiceOver's voice would go into the phrase.
@Suite("Записать: VoiceOver слышит итог фразы")
struct LastPhraseSpeechTests {
    private static let tashkent = TimeZone(identifier: "Asia/Tashkent")!
    /// 2026-10-29 14:32:05 in Tashkent.
    private static let inputTime = Date(timeIntervalSince1970: 1_793_266_325)
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = tashkent
        return calendar
    }()

    private static let coffee = "Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"

    private func phrase(_ text: String, attempts: Int = 0, minutesLater: Double = 0) -> Capture {
        var capture = Capture(
            clientId: UUID(),
            text: text,
            capturedAt: Self.inputTime.addingTimeInterval(minutesLater * 60),
            timeZoneIdentifier: "Asia/Tashkent"
        )
        capture.attempts = attempts
        return capture
    }

    /// The same phrase, answered with this body.
    private func written(_ capture: Capture, body: String) throws -> Capture {
        var sent = capture
        sent.state = .sent
        sent.attempts += 1
        sent.reply = try CaptureReplyBodies.reply(body)
        return sent
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
        saving: String? = nil,
        note: LastPhrase.Note? = nil
    ) -> LastPhrase? {
        LastPhrase.of(state, LastPhrase.Context(
            configured: configured,
            marks: marks,
            accountNames: accountNames,
            undoing: undoing,
            saving: saving,
            note: note,
            now: Self.inputTime,
            calendar: Self.calendar
        ))
    }

    private static let olderId = UUID()

    /// The phrase on the card before the new one, written ten minutes earlier.
    private func olderPhrase() throws -> Capture {
        let older = Capture(
            clientId: Self.olderId,
            text: "такси 18к",
            capturedAt: Self.inputTime.addingTimeInterval(-10 * 60),
            timeZoneIdentifier: "Asia/Tashkent"
        )
        return try written(older, body: CaptureReplyBodies.taxiFromDocs)
    }

    /// The speech with the older phrase already on the card: the screen was open before the new one came.
    private func opened() throws -> LastPhraseSpeech {
        var speech = LastPhraseSpeech()
        #expect(speech.news(card(state([try olderPhrase()])), voice: .idle) == nil)
        return speech
    }

    // MARK: The server's answer

    @Test("«Отправляю…» не объявляется; «Записал: …» — та же строка, что на карточке")
    func written() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе 45", minutesLater: 1)

        #expect(speech.news(card(state([older, capture])), voice: .idle) == nil)
        let sent = try written(capture, body: CaptureReplyBodies.coffee)
        #expect(speech.news(card(state([older, sent])), voice: .idle) == Self.coffee)
        // The same card again — a new state of the queue, the account names come — is no news
        #expect(speech.news(card(state([older, sent])), voice: .idle) == nil)
    }

    @Test("несколько строк итога — одним объявлением, через точку, как плашка")
    func severalLines() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе 25к, такси", minutesLater: 1)
        _ = speech.news(card(state([older, capture])), voice: .idle)

        let sent = try written(capture, body: CaptureReplyBodies.coffeeAndTaxiWithoutAmount)
        #expect(speech.news(card(state([older, sent])), voice: .idle)
            == "Записал: кофе · Кафе · −25\u{00A0}000\u{00A0}сум · Карта. Без суммы, не записал: такси — скажи с суммой")
    }

    @Test("«Записал, проверь: …» и «Не нашёл операцию» — их строки")
    func reviewAndNotFound() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let headphones = phrase("кофе 25к и наушники 55$", minutesLater: 1)
        _ = speech.news(card(state([older, headphones])), voice: .idle)
        let reviewed = try written(headphones, body: CaptureReplyBodies.coffeeAndHeadphones)
        #expect(speech.news(card(state([older, reviewed])), voice: .idle) == [
            "Записал: кофе · Кафе · −25\u{00A0}000\u{00A0}сум · Карта",
            "Записал, проверь: наушники · Покупки? · −55,00\u{00A0}USD · Карта",
        ].joined(separator: ". "))

        let hello = phrase("привет", minutesLater: 2)
        _ = speech.news(card(state([older, reviewed, hello])), voice: .idle)
        var notFound = hello
        notFound.state = .sent
        notFound.attempts = 1
        notFound.reply = CaptureReply(status: "no_transaction", title: "Не нашёл операцию", summary: "")
        #expect(speech.news(card(state([older, reviewed, notFound])), voice: .idle) == LastPhrase.notFoundText)
    }

    @Test("отказ сервера — «Не записал: …»")
    func refused() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе", minutesLater: 1)
        _ = speech.news(card(state([older, capture])), voice: .idle)

        var rejected = capture
        rejected.state = .rejected
        rejected.attempts = 1
        let shown = try #require(card(state([older, rejected])))
        #expect(speech.news(shown, voice: .idle) == shown.lines.first?.text)
        #expect(shown.lines.first?.text.hasPrefix("Не записал: ") == true)
    }

    // MARK: Waiting

    @Test("нет связи, сервер не ответил — их строки; та же причина после новой попытки — не новость")
    func waiting() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе 25к", minutesLater: 1)
        _ = speech.news(card(state([older, capture])), voice: .idle)

        var tried = capture
        tried.attempts = 1
        let offline = state([older, tried]) { $0.wait = .offline }
        #expect(speech.news(card(offline), voice: .idle) == "Нет связи — уйдёт, когда появится сеть")

        // The next pass: «Отправляю…», then no network again — the haptic is silent then too
        #expect(speech.news(card(state([older, tried]) { $0.sendingId = tried.clientId }), voice: .idle) == nil)
        tried.attempts = 2
        #expect(speech.news(card(state([older, tried]) { $0.wait = .offline }), voice: .idle) == nil)

        #expect(speech.news(card(state([older, tried]) { $0.wait = .noAnswer }), voice: .idle)
            == "Сервер не ответил — уйдёт позже")
    }

    @Test("новая фраза сразу с итогом — нет адреса и токена, токен не принят: их строки")
    func settings() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let unset = phrase("кофе 25к", minutesLater: 1)
        #expect(speech.news(card(state([older, unset]), configured: false), voice: .idle) == "Укажи адрес и токен")

        let next = phrase("такси 18к", minutesLater: 2)
        let refused = state([older, unset, next]) { $0.tokenRefused = true }
        #expect(speech.news(card(refused), voice: .idle) == "Сервер не принял токен")
    }

    /// The line is known by its id and kind, not by its text: the text moves while the news stays the same.
    @Test("новое время паузы 429 — не новое объявление")
    func busyTimeMoves() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе 25к", attempts: 1, minutesLater: 1)
        let pause = { (minutes: Double) in
            self.state([older, capture]) {
                $0.wait = .busy
                $0.notBefore = Self.inputTime.addingTimeInterval(minutes * 60)
            }
        }

        #expect(speech.news(card(pause(15)), voice: .idle) == "Сервер просит подождать — уйдёт в 14:47")
        let later = try #require(card(pause(30)))
        #expect(later.lines.map(\.text) == ["Сервер просит подождать — уйдёт в 15:02"])
        #expect(speech.news(later, voice: .idle) == nil)
    }

    @Test("имя счёта пришло после повтора — «Записал» второй раз не звучит")
    func accountNameComesLater() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let record = CapturedRecord(
            id: "rec-coffee", type: .expense, amountMinor: 4_500_000, currency: "UZS", categoryId: "cat-cafe",
            category: "Кафе", accountId: "acc-card", accountName: nil, description: "кофе",
            needsReview: false, assumptions: [], deletedAt: nil
        )
        var capture = phrase("кофе 45", minutesLater: 1)
        _ = speech.news(card(state([older, capture])), voice: .idle)
        capture.state = .sent
        capture.attempts = 2
        capture.reply = CaptureReply(status: "saved", title: "Записал", summary: "кофе · 45 000 сум", records: [record])

        #expect(speech.news(card(state([older, capture])), voice: .idle)
            == "Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум")
        let named = try #require(card(state([older, capture]), accountNames: ["acc-card": "Карта"]))
        #expect(named.lines.map(\.text) == ["Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"])
        #expect(speech.news(named, voice: .idle) == nil)
    }

    // MARK: No news

    @Test("карточка, с которой открылся экран, — не новость, даже с итогом")
    func cardOnOpening() throws {
        let capture = try CaptureReplyBodies.sentCapture(UUID(), text: "кофе 45", body: CaptureReplyBodies.coffee)

        var openedWithCard = LastPhraseSpeech()
        #expect(openedWithCard.news(card(state([capture])), voice: .idle) == nil)

        // The queue's file came after the first frame: the card before it was empty
        var openedEmpty = LastPhraseSpeech()
        #expect(openedEmpty.news(nil, voice: .idle) == nil)
        #expect(openedEmpty.news(card(state([capture])), voice: .idle) == nil)
    }

    @Test("удалили — «Удалено: …» не объявляется, его говорит плашка; «Вернуть» — «Записал» второй раз не звучит")
    func deletedAndBack() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе 45", minutesLater: 1)
        _ = speech.news(card(state([older, capture])), voice: .idle)
        let sent = try written(capture, body: CaptureReplyBodies.coffee)
        #expect(speech.news(card(state([older, sent])), voice: .idle) == Self.coffee)

        let marks = LastPhraseMarks(clientId: sent.clientId, deleted: [CaptureReplyBodies.coffeeId])
        #expect(speech.news(card(state([older, sent]), marks: marks), voice: .idle) == nil)
        let restoring = card(state([older, sent]), marks: marks, undoing: [CaptureReplyBodies.coffeeId])
        #expect(speech.news(restoring, voice: .idle) == nil)
        #expect(speech.news(card(state([older, sent])), voice: .idle) == nil)
    }

    // MARK: Taken off the phone (#346)

    /// A phrase waiting for a network, «Нет связи…» said already.
    private struct Waiting {
        var speech: LastPhraseSpeech
        let older: Capture
        let capture: Capture

        func offline(_ change: (inout QueueState) -> Void = { _ in }) -> QueueState {
            var state = QueueState()
            state.captures = [older, capture]
            state.wait = .offline
            change(&state)
            return state
        }

        func marks(mayBeOnServer: Bool) -> LastPhraseMarks {
            LastPhraseMarks(
                clientId: capture.clientId,
                removed: .init(text: capture.text, capturedAt: capture.capturedAt, mayBeOnServer: mayBeOnServer)
            )
        }
    }

    private func waiting() throws -> Waiting {
        var waiting = Waiting(
            speech: try opened(),
            older: try olderPhrase(),
            capture: phrase("кофе 25к", attempts: 1, minutesLater: 1)
        )
        #expect(waiting.speech.news(card(waiting.offline()), voice: .idle) == "Нет связи — уйдёт, когда появится сеть")
        return waiting
    }

    @Test("удалена с телефона — «Удалено с телефона», как на карточке; следующий отчёт очереди — не новость")
    func removedFromPhone() throws {
        var waiting = try waiting()
        let marks = waiting.marks(mayBeOnServer: false)

        // At once, before the queue's next state reaches the screen: the phrase is still in it
        let atOnce = try #require(card(waiting.offline(), marks: marks))
        #expect(atOnce.lines.map(\.text) == ["Удалено с телефона"])
        #expect(waiting.speech.news(atOnce, voice: .idle) == "Удалено с телефона")
        #expect(waiting.speech.news(card(state([waiting.older]), marks: marks), voice: .idle) == nil)
    }

    @Test("могла записаться — «Удалено с телефона — она уже уходила на сервер, проверь «Записи»»")
    func removedMayBeOnServer() throws {
        var waiting = try waiting()

        let removed = card(waiting.offline(), marks: waiting.marks(mayBeOnServer: true))

        #expect(waiting.speech.news(removed, voice: .idle)
            == "Удалено с телефона — она уже уходила на сервер, проверь «Записи»")
    }

    @Test("«Удалено с телефона», с которой открылся экран, — не новость")
    func removedOnOpening() throws {
        let older = try olderPhrase()
        let marks = LastPhraseMarks(
            clientId: UUID(),
            removed: .init(text: "кофе 25к", capturedAt: Self.inputTime, mayBeOnServer: false)
        )
        var speech = LastPhraseSpeech()

        #expect(speech.news(card(state([older]), marks: marks), voice: .idle) == nil)
    }

    private static let whileSending = "Уже отправляется — удалить можно, когда запишется"

    @Test("запрос ушёл между показом и нажатием — заметка «Уже отправляется…»; записал — «Записал: …»")
    func noteWhileSending() throws {
        var waiting = try waiting()
        let capture = waiting.capture
        let note = LastPhrase.Note(clientId: capture.clientId, text: Self.whileSending, whileSending: true)

        let sending = try #require(card(waiting.offline { $0.sendingId = capture.clientId }, note: note))
        #expect(sending.lines.map(\.text) == [LastPhrase.sendingText])
        #expect(sending.note == Self.whileSending)
        #expect(waiting.speech.news(sending, voice: .idle) == Self.whileSending)
        // The same card again — the next state of the queue — is no news
        #expect(waiting.speech.news(sending, voice: .idle) == nil)

        let sent = try written(capture, body: CaptureReplyBodies.coffee)
        #expect(waiting.speech.news(card(state([waiting.older, sent]), note: note), voice: .idle)
            == "Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта")
    }

    @Test("заметка ушла и пришла снова — снова объявляется: не дошло, «Удалить» опять, а запрос опять в пути")
    func noteAgain() throws {
        var waiting = try waiting()
        let capture = waiting.capture
        let note = LastPhrase.Note(clientId: capture.clientId, text: Self.whileSending, whileSending: true)
        let sending = card(waiting.offline { $0.sendingId = capture.clientId }, note: note)
        #expect(waiting.speech.news(sending, voice: .idle) == Self.whileSending)

        // Did not go: «Удалить» is back and the note goes; no network again is no news, as with the haptic
        let failed = try #require(card(waiting.offline(), note: note))
        #expect(failed.note == nil)
        #expect(failed.deletion == .fromPhone(capture.clientId))
        #expect(waiting.speech.news(failed, voice: .idle) == nil)

        #expect(waiting.speech.news(sending, voice: .idle) == Self.whileSending)
    }

    @Test("не удалилось — заметка «Не удалилось: …», слово в слово")
    func noteNotRemoved() throws {
        var waiting = try waiting()
        let capture = waiting.capture
        let text = "Не удалилось: \(QueueError.unavailable.localizedDescription)"

        let failed = try #require(card(waiting.offline(), note: LastPhrase.Note(clientId: capture.clientId, text: text)))

        #expect(failed.note == text)
        #expect(failed.deletion == .fromPhone(capture.clientId))
        #expect(waiting.speech.news(failed, voice: .idle)
            == "Не удалилось: очередь на телефоне пока закрыта — разблокируй телефон и попробуй ещё раз")
    }

    // MARK: The microphone

    @Test(
        "микрофон включён — молчит; выключился — говорит, что пришло за это время",
        arguments: [VoiceCapture.Phase.starting, .listening, .finishing]
    )
    func heldWhileListening(phase: VoiceCapture.Phase) throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе 45", minutesLater: 1)
        _ = speech.news(card(state([older, capture])), voice: .idle)
        let sent = try written(capture, body: CaptureReplyBodies.coffee)

        #expect(speech.news(card(state([older, sent])), voice: phase) == nil)
        // The next phrase goes to the phone: the microphone is off, the card shows it already
        #expect(speech.news(card(state([older, sent]), saving: "такси 18к"), voice: .saving) == Self.coffee)
        #expect(speech.news(card(state([older, sent]), saving: "такси 18к"), voice: .idle) == nil)
    }

    @Test("удалили с телефона, пока микрофон включён, — ждёт, как итог")
    func removedWhileListening() throws {
        var waiting = try waiting()
        let removed = card(waiting.offline(), marks: waiting.marks(mayBeOnServer: false))

        #expect(waiting.speech.news(removed, voice: .listening) == nil)
        #expect(waiting.speech.news(removed, voice: .idle) == "Удалено с телефона")
    }

    /// The phone locked mid-phrase (review of PR #345): by the return the card shows the next phrase, and a line held
    /// may be untrue — the queue sends in the background, «Нет связи» may be «Записал» by then.
    @Test("приложение ушло с экрана, пока микрофон включён, — ждавшее не звучит и по возвращении")
    func heldDroppedOffScreen() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе 45", minutesLater: 1)
        _ = speech.news(card(state([older, capture])), voice: .idle)
        let sent = try written(capture, body: CaptureReplyBodies.coffee)
        #expect(speech.news(card(state([older, sent])), voice: .listening) == nil)

        speech.appLeftScreen()

        // The microphone writes what it heard and goes off; then the screen is back
        #expect(speech.news(card(state([older, sent]), saving: "такси 18к"), voice: .saving) == nil)
        #expect(speech.news(card(state([older, sent])), voice: .idle) == nil)
    }

    @Test("голосовая фраза не записалась на телефон — прежний итог снова не звучит")
    func voiceNotSaved() throws {
        var speech = try opened()
        let older = try olderPhrase()
        // «Отправляю…» without an id while the microphone writes the phrase; then `.notSaved`: the older card is back
        #expect(speech.news(card(state([older]), saving: "кофе 45"), voice: .saving) == nil)
        #expect(speech.news(card(state([older])), voice: .idle) == nil)
    }

    @Test("голос пишет фразу на телефон — «Отправляю…» без id, потом она в очереди: не новость")
    func voiceSaving() throws {
        var speech = try opened()
        let older = try olderPhrase()
        #expect(speech.news(card(state([older]), saving: "кофе 45"), voice: .saving) == nil)

        let capture = phrase("кофе 45", minutesLater: 1)
        #expect(speech.news(card(state([older, capture])), voice: .idle) == nil)
        let sent = try written(capture, body: CaptureReplyBodies.coffee)
        #expect(speech.news(card(state([older, sent])), voice: .idle) == Self.coffee)
    }
}
