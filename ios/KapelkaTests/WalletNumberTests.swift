import Foundation
import Testing
@testable import Kapelka

/// Wallet's «Сумма» as the number field of «Записать оплату» gets it, and «Код валюты» as text (#398): the same string
/// of `POST /api/quick-capture/payment` as the text «28 000,00 UZS» gives, the same refusals. Shortcuts make the number
/// a `Double` themselves, so the cents are restored by rounding; the string is written from integers.
@Suite("Сумма из Wallet числом")
struct WalletNumberTests {
    @Test(
        "та же строка, что из текста Wallet: сумы и доллары",
        arguments: [
            ("28 000,00 UZS", 28_000.0, "UZS"),
            ("2 500,00 UZS", 2_500, "UZS"),
            ("1 250 000,50 UZS", 1_250_000.5, "UZS"),
            ("$4.50", 4.5, "USD"),
            ("0,99 USD", 0.99, "USD"),
            ("1,234.56 USD", 1_234.56, "USD"),
            ("19,99 USD", 19.99, "USD"),
            ("1 000 000 000,00 UZS", 1_000_000_000, "UZS"),
        ]
    )
    func sameAsWalletText(wallet: String, number: Double, code: String) {
        #expect(WalletAmount.read(number: number, code: code) == WalletAmount.read(wallet))
    }

    @Test("всегда две цифры после точки, как в сумме Wallet: 28000 — «28000.00»")
    func twoDecimals() {
        #expect(WalletAmount.read(number: 28_000, code: "UZS") == .amount("28000.00", .uzs))
        #expect(WalletAmount.read(number: 4.5, code: "USD") == .amount("4.50", .usd))
        #expect(WalletAmount.read(number: 12, code: "USD") == .amount("12.00", .usd))
    }

    @Test(
        "хвост Double не попадает в сумму: копейки восстанавливаются точно",
        arguments: [
            (0.06999999999999999, "0.07"),
            (0.07, "0.07"),
            (1_234.5599999999997, "1234.56"),
            (999_999_999.99, "999999999.99"),
            (0.1 + 0.2, "0.30"),
        ]
    )
    func doubleTail(number: Double, amount: String) {
        #expect(WalletAmount.read(number: number, code: "USD") == .amount(amount, .usd))
    }

    @Test("ноль — Wallet не знал суммы: быстрые команды дают 0, команда не падает (#398)")
    func zero() {
        #expect(WalletAmount.read(number: 0, code: "UZS") == .problem(.zero))
        #expect(WalletAmount.read(number: 0, code: "UZS") == WalletAmount.read("0,00 UZS"))
        #expect(WalletAmount.read(number: 0.004, code: "USD") == .problem(.zero))
    }

    @Test("больше 1 000 000 000 — сервер такую запись не берёт")
    func tooLarge() {
        #expect(WalletAmount.read(number: 1_000_000_000.01, code: "UZS") == .problem(.tooLarge))
        #expect(WalletAmount.read(number: 12_000_000_000, code: "UZS") == .problem(.tooLarge))
    }

    @Test(
        "другая валюта не уходит: её код — для списка, как из текста",
        arguments: [("EUR", "10,00 EUR"), ("RUB", "10 ₽"), ("eur", "10,00 €")]
    )
    func otherCurrency(code: String, wallet: String) {
        let read = WalletAmount.read(number: 10, code: code, fallback: .uzs)
        #expect(read == .problem(.otherCurrency(code.uppercased())))
        #expect(read == WalletAmount.read(wallet, fallback: .uzs))
    }

    @Test("код из Wallet важнее валюты карты или автоматизации")
    func walletCodeWins() {
        #expect(WalletAmount.read(number: 4.5, code: "USD", fallback: .uzs) == .amount("4.50", .usd))
        #expect(WalletAmount.read(number: 28_000, code: " uzs ", fallback: .usd) == .amount("28000.00", .uzs))
    }

    @Test("кода нет — валюта карты или автоматизации; нет и её — не отправляется", arguments: [nil, "", "  "])
    func noCode(code: String?) {
        #expect(WalletAmount.read(number: 4.5, code: code, fallback: .usd) == .amount("4.50", .usd))
        #expect(WalletAmount.read(number: 4.5, code: code) == .problem(.noCurrency))
    }

    @Test("отрицательная, не число или бесконечность — не понял, не угадывается", arguments: [-5, .nan, .infinity])
    func unreadable(number: Double) {
        #expect(WalletAmount.read(number: number, code: "UZS") == .problem(.unreadable))
    }

    @Test("непонятный код валюты — не угадывается")
    func unreadableCode() {
        #expect(WalletAmount.read(number: 5, code: "сумма", fallback: .uzs) == .problem(.unreadable))
    }

    @Test("для списка — как Wallet пишет сумму: «28 000,00 UZS», без кода — только число")
    func text() {
        let nbsp = "\u{00A0}"
        #expect(WalletAmount.text(number: 28_000, code: "UZS") == "28\(nbsp)000,00\(nbsp)UZS")
        #expect(WalletAmount.text(number: 1_250_000.5, code: "uzs") == "1\(nbsp)250\(nbsp)000,50\(nbsp)UZS")
        #expect(WalletAmount.text(number: 4.5, code: "USD") == "4,50\(nbsp)USD")
        #expect(WalletAmount.text(number: 0, code: "UZS") == "0,00\(nbsp)UZS")
        #expect(WalletAmount.text(number: 0.07, code: nil) == "0,07")
        #expect(WalletAmount.text(number: -5, code: "UZS") == "-5,00\(nbsp)UZS")
        #expect(WalletAmount.text(number: .nan, code: "UZS") == "nan\(nbsp)UZS")
    }
}
