import Foundation
import Testing
@testable import Kapelka

@Suite("Ошибка 400 по-русски")
struct RejectionTextTests {
    @Test(
        "текст сервера по-английски — на экране по-русски",
        arguments: [
            ("capturedAt is older than 30 days", "старше 30 дней — сервер такие не берёт, запиши в Mini App"),
            (
                "capturedAt must be an ISO 8601 time with seconds and a time zone, like 2026-10-27T09:15:00+05:00",
                "сервер не понял время ввода"
            ),
            ("Text is too long (maximum 2000 characters)", "длиннее 2000 символов"),
            ("Text is required and cannot be empty", "пустая фраза"),
            ("Source must be one of: telegram, miniapp, ios_shortcut", "сервер не принял запись"),
            ("Invalid JSON in request body", "сервер не принял запись"),
        ]
    )
    func translated(server: String, shown: String) {
        #expect(RejectionText.shown(for: server) == shown)
    }

    @Test(
        "ошибки оплаты (`docs/QUICK_CAPTURE_API.md`, «Payment errors») — по-русски",
        arguments: [
            (#"amount must be a decimal string of сум or dollars with a dot, like "25000" or "4.50""#, "сервер не понял сумму"),
            ("Amount must be at least 0.01", "сумма меньше 0,01"),
            ("Amount must be no more than 1,000,000,000", "больше 1 000 000 000 — сервер такую запись не берёт"),
            ("currency must be UZS or USD", "сервер пишет только сумы и доллары"),
            ("merchant must be a string of up to 200 characters", "название магазина длиннее 200 символов"),
            ("accountName must be a string of up to 100 characters", "имя счёта длиннее 100 символов — поправь в настройках Kapelka"),
            ("No visible account to record into", "в Kapelka все счета скрыты — открой счёт в Mini App"),
        ]
    )
    func paymentErrors(server: String, shown: String) {
        #expect(RejectionText.shown(for: server) == shown)
    }

    @Test("без текста — общая фраза; русский текст сервера — как есть")
    func fallbackAndRussian() {
        #expect(RejectionText.shown(for: nil) == "сервер не принял запись")
        #expect(RejectionText.shown(for: "Сервер не принял запись") == "Сервер не принял запись")
    }
}
