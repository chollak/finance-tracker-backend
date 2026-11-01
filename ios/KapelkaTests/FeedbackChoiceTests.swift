import Foundation
import SwiftUI
import Testing
@testable import Kapelka

/// «Вибрация, уведомление или ничего» (FT-251): one row of the task's table per test, then the app off screen.
@Suite("Отклик: выбор")
struct FeedbackChoiceTests {
    private static let at = Date(timeIntervalSince1970: 1_793_266_325)

    private func capture(_ text: String = "кофе 25к", body: String? = nil, attempts: Int = 1) throws -> Capture {
        var capture = Capture(clientId: UUID(), text: text, capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent")
        capture.attempts = attempts
        if let body {
            capture.state = .sent
            capture.reply = try CaptureReplyBodies.reply(body)
        }
        return capture
    }

    private func onScreen(_ event: FeedbackEvent) -> FeedbackResponse {
        FeedbackChoice.response(to: event, onScreen: true)
    }

    // MARK: The table, the app on screen

    @Test("микрофон начал слушать — impact medium")
    func listening() {
        #expect(onScreen(.listening) == .haptic(.listening))
    }

    @Test("сервер записал фразу или оплату — success")
    func wrote() throws {
        let phrase = try capture(body: CaptureReplyBodies.coffee)
        let payment = try capture("", body: CaptureReplyBodies.paymentFromDocs)

        #expect(onScreen(.queue([.wrote([phrase])])) == .haptic(.success))
        #expect(onScreen(.queue([.wrote([payment])])) == .haptic(.success))
    }

    @Test("записал, но «проверь» — warning")
    func wroteNeedsReview() throws {
        let unsure = try capture("кофе 25к и наушники 55$", body: CaptureReplyBodies.coffeeAndHeadphones)

        #expect(onScreen(.queue([.wrote([unsure])])) == .haptic(.warning))
    }

    @Test("записал, но часть фразы без суммы («кофе 25к, такси») — warning, а не «успех»")
    func wroteWithoutAmount() throws {
        let partly = try capture("кофе 25к, такси", body: CaptureReplyBodies.coffeeAndTaxiWithoutAmount)

        #expect(partly.reply?.status == "saved")
        #expect(partly.reply?.withoutAmount.map(\.description) == ["такси"])
        #expect(onScreen(.queue([.wrote([partly])])) == .haptic(.warning))
        #expect(onScreen(.queue([.wrote([try capture(body: CaptureReplyBodies.coffee), partly])])) == .haptic(.warning))
    }

    @Test("первая попытка кончилась «позже» — impact light")
    func queued() throws {
        #expect(onScreen(.queue([.queued([try capture()])])) == .haptic(.queued))
    }

    @Test("ошибки — error: голос, «Не нашёл операцию», отказ 400, токен, правка без связи")
    func errors() throws {
        let notFound = try capture("привет", body: ServerReply.saved(status: "no_transaction"))
        let refused = try capture("длинная фраза")

        #expect(onScreen(.voiceFailed) == .haptic(.error))
        #expect(onScreen(.queue([.noOperation([notFound])])) == .haptic(.error))
        #expect(onScreen(.queue([.rejected([refused])])) == .haptic(.error))
        #expect(onScreen(.queue([.tokenRefused])) == .haptic(.error))
        #expect(onScreen(.editFailed) == .haptic(.error))
    }

    @Test("категория сохранена, «Вернуть» сработало — success")
    func editSaved() {
        #expect(onScreen(.editSaved) == .haptic(.success))
    }

    // MARK: One pass, one haptic

    @Test("проход с разными исходами — один отклик, самый важный: ошибка, «проверь», «записал», «в очереди»")
    func strongestOfPass() throws {
        let written = QueueEvent.wrote([try capture(body: CaptureReplyBodies.coffee)])
        let unsure = QueueEvent.wrote([try capture(body: CaptureReplyBodies.coffeeAndHeadphones)])
        let notFound = QueueEvent.noOperation([try capture("привет", body: ServerReply.saved(status: "no_transaction"))])
        let waiting = QueueEvent.queued([try capture()])

        #expect(onScreen(.queue([written, notFound, waiting])) == .haptic(.error))
        #expect(onScreen(.queue([written, waiting, .tokenRefused])) == .haptic(.error))
        #expect(onScreen(.queue([unsure, waiting])) == .haptic(.warning))
        let sureAndUnsure = QueueEvent.wrote([
            try capture(body: CaptureReplyBodies.coffee),
            try capture(body: CaptureReplyBodies.coffeeAndHeadphones),
        ])
        #expect(onScreen(.queue([sureAndUnsure])) == .haptic(.warning))
        #expect(onScreen(.queue([written, waiting])) == .haptic(.success))
    }

    @Test("пустой проход — ничего")
    func emptyPass() {
        #expect(onScreen(.queue([])) == .nothing)
        #expect(FeedbackChoice.response(to: .queue([]), onScreen: false) == .nothing)
    }

    // MARK: Off screen

    @Test("приложение не на экране — вибрации нет, проход уходит в уведомления целиком")
    func backgroundGoesToNotices() throws {
        let pass: [QueueEvent] = [
            .wrote([try capture(body: CaptureReplyBodies.coffee)]),
            .noOperation([try capture("привет", body: ServerReply.saved(status: "no_transaction"))]),
            .tokenRefused,
        ]

        let waiting: [QueueEvent] = [.queued([try capture()])]

        #expect(FeedbackChoice.response(to: .queue(pass), onScreen: false) == .notices(pass))
        #expect(FeedbackChoice.response(to: .queue(waiting), onScreen: false) == .notices(waiting))
    }

    @Test("не на экране микрофон и правки — ничего: уведомлять не о чем")
    func backgroundScreenEvents() {
        for event in [FeedbackEvent.listening, .voiceFailed, .editSaved, .editFailed] {
            #expect(FeedbackChoice.response(to: event, onScreen: false) == .nothing)
        }
    }

    // MARK: The system's haptics

    @Test("системный отклик каждой строки: .start на iPhone не вибрирует — микрофон это impact medium")
    func sensoryFeedback() {
        #expect(Haptic.listening.sensoryFeedback == .impact(weight: .medium))
        #expect(Haptic.success.sensoryFeedback == .success)
        #expect(Haptic.warning.sensoryFeedback == .warning)
        #expect(Haptic.queued.sensoryFeedback == .impact(weight: .light))
        #expect(Haptic.error.sensoryFeedback == .error)
    }
}
