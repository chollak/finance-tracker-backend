import Foundation
import Testing
@testable import Kapelka

/// «уйдёт позже» of a payment says why, as the card on «Записать» does (FT-252, FT-256): no network on the phone, the
/// server did not answer, the server asks to wait — by `QueueWait`.
@Suite("Оплата: почему уйдёт позже")
struct PaymentNoticeTests {
    private static let line = "KORZINKA 24 · \u{2212}25\u{00A0}000\u{00A0}сум"

    private func waiting() -> Capture {
        let payment = Payment(
            walletAmount: "25 000,00 UZS",
            amount: "25000.00",
            currency: "UZS",
            merchant: "KORZINKA 24",
            card: "TBC Uzbekistan"
        )
        var capture = Capture(
            clientId: UUID(),
            text: "",
            capturedAt: Date(timeIntervalSince1970: 1_793_266_325),
            timeZoneIdentifier: "Asia/Tashkent",
            payment: payment
        )
        capture.attempts = 1
        return capture
    }

    private func body(_ wait: QueueWait?, notBefore: Date? = nil) -> String? {
        var state = QueueState()
        state.wait = wait
        state.notBefore = notBefore
        return PaymentNotice.notice(for: waiting(), state, configured: true)?.body
    }

    @Test("нет связи — «уйдёт, когда появится сеть»; сервер не ответил — «уйдёт позже»; 429 — «просит подождать»")
    func byTheReason() {
        #expect(body(.offline) == "\(Self.line) — нет связи, уйдёт, когда появится сеть")
        #expect(body(.noAnswer) == "\(Self.line) — сервер не ответил, уйдёт позже")
        #expect(body(.busy, notBefore: Date()) == "\(Self.line) — сервер просит подождать, уйдёт позже")
    }

    @Test("причины нет — без неё; файл до FT-252 с паузой 429 — «просит подождать»")
    func withoutTheReason() {
        #expect(body(nil) == "\(Self.line) — уйдёт позже")
        #expect(body(nil, notBefore: Date()) == "\(Self.line) — сервер просит подождать, уйдёт позже")
    }

    @Test("нажатие — «Записать», под clientId оплаты")
    func opensCapture() throws {
        let capture = waiting()
        var state = QueueState()
        state.wait = .offline
        let notice = try #require(PaymentNotice.notice(for: capture, state, configured: true))

        #expect(notice.opens == .capture)
        #expect(notice.id == capture.clientId.uuidString)
    }
}
