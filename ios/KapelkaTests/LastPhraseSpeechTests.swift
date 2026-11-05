import Foundation
import Testing
@testable import Kapelka

/// #285: VoiceOver hears what became of the phrase — the lines of the card «Последняя фраза», word for word, each once.
/// «Отправляю…» is no news, nor a line «Удалено…» (the bar «Удалено · Вернуть» answers a delete), nor the card the
/// screen opens with. While the microphone is on nothing is said: VoiceOver's voice would go into the phrase.
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
        undoing: Set<String> = [],
        saving: String? = nil
    ) -> LastPhrase? {
        LastPhrase.of(state, LastPhrase.Context(
            configured: configured,
            marks: marks,
            undoing: undoing,
            saving: saving,
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

    @Test("удалена с телефона — «Удалено с телефона» не объявляется")
    func removedFromPhone() throws {
        var speech = try opened()
        let older = try olderPhrase()
        let capture = phrase("кофе 25к", attempts: 1, minutesLater: 1)
        #expect(speech.news(card(state([older, capture]) { $0.wait = .offline }), voice: .idle) != nil)

        let removed = LastPhraseMarks(
            clientId: capture.clientId,
            removed: .init(text: capture.text, capturedAt: capture.capturedAt, mayBeOnServer: false)
        )
        #expect(speech.news(card(state([older]), marks: removed), voice: .idle) == nil)
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
