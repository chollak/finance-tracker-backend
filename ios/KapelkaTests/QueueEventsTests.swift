import Foundation
import Testing
@testable import Kapelka

/// What one pass of the queue did, read from the states before and after it (FT-251): the haptic on screen and the
/// notices in the background (FT-253) are built on it. One event per kind, however many records the pass sent.
@Suite("События очереди")
struct QueueEventsTests {
    private static let at = Date(timeIntervalSince1970: 1_793_266_325)

    private func pending(_ text: String = "кофе 25к", attempts: Int = 0, id: UUID = UUID()) -> Capture {
        var capture = Capture(clientId: id, text: text, capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent")
        capture.attempts = attempts
        return capture
    }

    private func sent(_ capture: Capture, body: String) throws -> Capture {
        var next = capture
        next.state = .sent
        next.attempts += 1
        next.reply = try CaptureReplyBodies.reply(body)
        return next
    }

    private func rejected(_ capture: Capture) -> Capture {
        var next = capture
        next.state = .rejected
        next.attempts += 1
        next.rejection = "Text is too long (maximum 2000 characters)"
        return next
    }

    private func triedAgain(_ capture: Capture) -> Capture {
        var next = capture
        next.attempts += 1
        return next
    }

    private func state(_ captures: [Capture], tokenRefused: Bool = false) -> QueueState {
        var state = QueueState()
        state.captures = captures
        state.tokenRefused = tokenRefused
        return state
    }

    // MARK: Each transition

    @Test("сервер записал — «записал» с этой записью")
    func wrote() throws {
        let phrase = pending()
        let written = try sent(phrase, body: CaptureReplyBodies.coffee)

        #expect(QueueEvents.between(state([phrase]), state([written])) == [.wrote([written])])
    }

    @Test("записал, но «проверь» — тоже «записал», «проверь» читается по записям")
    func wroteNeedsReview() throws {
        let phrase = pending("кофе 25к и наушники 55$")
        let written = try sent(phrase, body: CaptureReplyBodies.coffeeAndHeadphones)

        #expect(QueueEvents.between(state([phrase]), state([written])) == [.wrote([written])])
        #expect(QueueEvents.needsReview(written))
        #expect(!QueueEvents.needsReview(try sent(phrase, body: CaptureReplyBodies.coffee)))
    }

    @Test("оплата Apple Pay, которую сервер записал, — «записал»")
    func paymentWrote() throws {
        let payment = Capture(
            clientId: UUID(), text: "", capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment(walletAmount: "25 000,00 UZS", amount: "25000.00", currency: "UZS", merchant: "KORZINKA 24", card: "TBC")
        )
        let written = try sent(payment, body: CaptureReplyBodies.paymentFromDocs)

        #expect(QueueEvents.between(state([payment]), state([written])) == [.wrote([written])])
    }

    @Test("«Не нашёл операцию» — своё событие, не «записал»")
    func noOperation() throws {
        let phrase = pending("привет")
        let answered = try sent(phrase, body: ServerReply.saved(status: "no_transaction", title: "Не нашёл операцию"))

        #expect(QueueEvents.between(state([phrase]), state([answered])) == [.noOperation([answered])])
    }

    @Test("отказ 400 — «не записал»")
    func rejectedByServer() {
        let phrase = pending()
        let refused = rejected(phrase)

        #expect(QueueEvents.between(state([phrase]), state([refused])) == [.rejected([refused])])
    }

    @Test("первая попытка кончилась «позже» — запись ждёт в очереди")
    func firstAttemptQueued() {
        let phrase = pending()
        let waiting = triedAgain(phrase)

        #expect(QueueEvents.between(state([phrase]), state([waiting])) == [.queued([waiting])])
    }

    @Test("вторая неудачная попытка — не новость")
    func laterAttemptIsNoNews() {
        let phrase = pending(attempts: 1)

        #expect(QueueEvents.between(state([phrase]), state([triedAgain(phrase)])).isEmpty)
    }

    @Test("токен не принят — одно событие, запись не считается ждущей")
    func tokenRefused() {
        let phrase = pending()

        let events = QueueEvents.between(state([phrase]), state([triedAgain(phrase)], tokenRefused: true))

        #expect(events == [.tokenRefused])
    }

    @Test("токен уже был не принят — нового события нет")
    func tokenRefusedAlready() {
        let phrase = pending(attempts: 1)

        #expect(QueueEvents.between(state([phrase], tokenRefused: true), state([phrase], tokenRefused: true)).isEmpty)
    }

    // MARK: A batch

    @Test("пачка: три записи за проход — одно событие «записал» с тремя")
    func batchIsOneEvent() throws {
        let phrases = [pending("кофе 25к"), pending("такси 18к"), pending("обед 60к")]
        let written = try phrases.map { try sent($0, body: CaptureReplyBodies.coffee) }

        #expect(QueueEvents.between(state(phrases), state(written)) == [.wrote(written)])
    }

    @Test("пачка с разными исходами — по событию на вид, в порядке записей")
    func mixedBatch() throws {
        let coffee = pending("кофе 25к")
        let hello = pending("привет")
        let long = pending("длинная фраза")
        let taxi = pending("такси 18к")
        let before = state([coffee, hello, long, taxi])
        let wroteCoffee = try sent(coffee, body: CaptureReplyBodies.coffee)
        let notFound = try sent(hello, body: ServerReply.saved(status: "no_transaction"))
        let refused = rejected(long)
        let waiting = triedAgain(taxi)

        let events = QueueEvents.between(before, state([wroteCoffee, notFound, refused, waiting]))

        #expect(events == [.wrote([wroteCoffee]), .noOperation([notFound]), .rejected([refused]), .queued([waiting])])
    }

    // MARK: Not news

    @Test("ничего не отправлялось — событий нет")
    func nothingSent() throws {
        let written = try sent(pending(), body: CaptureReplyBodies.coffee)
        let waiting = pending(attempts: 2)
        let same = state([written, waiting])

        #expect(QueueEvents.between(same, same).isEmpty)
    }

    @Test("фраза, добавленная и отправленная за проход, — «записал»")
    func addedDuringPass() throws {
        let earlier = try sent(pending("такси 18к"), body: CaptureReplyBodies.coffee)
        let added = try sent(pending("кофе 25к"), body: CaptureReplyBodies.coffee)

        #expect(QueueEvents.between(state([earlier]), state([earlier, added])) == [.wrote([added])])
    }

    @Test("фраза, только добавленная, и оплата, отклонённая на телефоне, — не ответ сервера")
    func addedWithoutAttempt() {
        var localRefusal = Capture(
            clientId: UUID(), text: "", capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment(walletAmount: "5,00 EUR", amount: nil, currency: "EUR", merchant: "EVOS", card: "TBC")
        )
        localRefusal.state = .rejected
        localRefusal.rejection = "Другая валюта"

        #expect(QueueEvents.between(state([]), state([pending(), localRefusal])).isEmpty)
    }

    @Test("удалённая и убранная записи — не новость")
    func removedIsNoNews() throws {
        let waiting = pending()
        let notFound = try sent(pending("привет"), body: ServerReply.saved(status: "no_transaction"))

        #expect(QueueEvents.between(state([waiting, notFound]), state([])).isEmpty)
    }

    // MARK: Decided by the data (FT-255 review)

    @Test("повтор после удаления всех записей — не «записал» и не «не нашёл»")
    func repeatAfterDeletion() throws {
        let phrase = pending("кофе 45", attempts: 1)
        let answered = try sent(phrase, body: CaptureReplyBodies.coffeeRepeated)

        #expect(QueueEvents.between(state([phrase]), state([answered])).isEmpty)
    }

    @Test("повтор, где удалена одна запись из двух, — «записал», удалённая не считается")
    func repeatWithOneDeleted() throws {
        let phrase = pending("хлеб 5к и бензин 200к картой", attempts: 1)
        let answered = try sent(phrase, body: CaptureReplyBodies.breadAndPetrolRepeatedAfterDeletion)

        #expect(QueueEvents.between(state([phrase]), state([answered])) == [.wrote([answered])])
        #expect(answered.reply?.liveRecords.map(\.description) == ["хлеб"])
    }

    @Test("repeated с полным ответом (повтор во время первой записи) — решают данные, а не флаг")
    func repeatedWithFullAnswer() throws {
        let body = CaptureReplyBodies.coffeeAndHeadphones.replacingOccurrences(
            of: #""review":{"reasons":["transaction_needs_review"]}"#,
            with: #""review":{"reasons":["transaction_needs_review"]},"repeated":true"#
        )
        let phrase = pending("кофе 25к и наушники 55$")
        let answered = try sent(phrase, body: body)

        #expect(answered.reply?.repeated == true)
        #expect(QueueEvents.between(state([phrase]), state([answered])) == [.wrote([answered])])
        #expect(QueueEvents.needsReview(answered))
    }

    @Test("ответ без записей (сервер до FT-255) — по статусу")
    func answerWithoutRecords() throws {
        let phrase = pending()
        let saved = try sent(phrase, body: ServerReply.saved())
        let unsure = try sent(phrase, body: ServerReply.saved(status: "needs_review"))

        #expect(QueueEvents.between(state([phrase]), state([saved])) == [.wrote([saved])])
        #expect(!QueueEvents.needsReview(saved))
        #expect(QueueEvents.needsReview(unsure))
    }
}
