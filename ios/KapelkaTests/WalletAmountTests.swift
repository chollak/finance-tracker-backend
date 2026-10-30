import Foundation
import Testing
@testable import Kapelka

/// Wallet's amount brought to the strict string of `POST /api/quick-capture/payment` (`docs/QUICK_CAPTURE_API.md`,
/// «Payments»): digits and a dot, no grouping, no currency, never through `Double`.
@Suite("Сумма из Wallet")
struct WalletAmountTests {
    private static let nbsp = "\u{00A0}"
    private static let narrowNbsp = "\u{202F}"

    @Test(
        "карта TBC: «28 000,00 UZS», как в уведомлении Wallet 2026-10-30 — 28000.00 сум, с любым пробелом",
        arguments: ["28 000,00 UZS", "28\(nbsp)000,00\(nbsp)UZS", "28\(narrowNbsp)000,00\(nbsp)UZS"]
    )
    func tbcCard(wallet: String) {
        #expect(WalletAmount.read(wallet) == .amount("28000.00", .uzs))
    }

    @Test(
        "сумы и доллары в других записях",
        arguments: [
            ("2 500,00 UZS", "2500.00", PaymentCurrency.uzs),
            ("3 000,00 UZS", "3000.00", .uzs),
            ("UZS 28 000,00", "28000.00", .uzs),
            ("28 000 сум", "28000", .uzs),
            ("28 000,00 сўм", "28000.00", .uzs),
            ("28000 so'm", "28000", .uzs),
            ("1 250 000,50 UZS", "1250000.50", .uzs),
            ("$4.50", "4.50", .usd),
            ("4,50 $", "4.50", .usd),
            ("4,5 USD", "4.5", .usd),
            ("US$12.99", "12.99", .usd),
            ("1,234.56 USD", "1234.56", .usd),
            ("1.234,56 USD", "1234.56", .usd),
            ("0,99 USD", "0.99", .usd),
            ("12 USD", "12", .usd),
            ("usd 7", "7", .usd),
        ]
    )
    func readsAmount(wallet: String, amount: String, currency: PaymentCurrency) {
        #expect(WalletAmount.read(wallet) == .amount(amount, currency))
    }

    @Test("в сумме нет валюты — берётся валюта из автоматизации, без неё не отправляется")
    func currencyFromAutomation() {
        #expect(WalletAmount.read("28 000,00", fallback: .uzs) == .amount("28000.00", .uzs))
        #expect(WalletAmount.read("4.50", fallback: .usd) == .amount("4.50", .usd))
        #expect(WalletAmount.read("28 000,00") == .problem(.noCurrency))
    }

    @Test("валюта в сумме важнее выбранной в автоматизации")
    func walletCurrencyWins() {
        #expect(WalletAmount.read("$4.50", fallback: .uzs) == .amount("4.50", .usd))
    }

    @Test(
        "другая валюта не уходит: её код — для списка",
        arguments: [("10,00 €", "EUR"), ("10,00 EUR", "EUR"), ("500 ₽", "RUB"), ("1 000 KZT", "KZT"), ("£3.20", "GBP")]
    )
    func otherCurrency(wallet: String, code: String) {
        #expect(WalletAmount.read(wallet, fallback: .uzs) == .problem(.otherCurrency(code)))
    }

    @Test("ноль — Wallet не передал сумму (бывает у автоматизации «Транзакция»)")
    func zero() {
        #expect(WalletAmount.read("0,00 UZS") == .problem(.zero))
        #expect(WalletAmount.read("0 $") == .problem(.zero))
    }

    @Test("суммы нет вовсе", arguments: ["", "   ", "UZS"])
    func missing(wallet: String) {
        #expect(WalletAmount.read(wallet, fallback: .uzs) == .problem(.missing))
    }

    @Test(
        "непонятный формат не угадывается",
        arguments: [
            "28 000,000 UZS",
            "28 00,00 UZS",
            "1.234.56 USD",
            "-5,00 UZS",
            "−5,00 UZS",
            "5,00 UZS 7",
            "1e5 USD",
            "12,34,56 USD",
            "2 500 000 x UZS",
            // The first group is one to three digits without a leading zero, or the number is not grouped (review)
            "0.125 USD",
            "0,500 UZS",
            "1234,567 UZS",
            "12345 678 UZS",
            "0 500 UZS",
        ]
    )
    func unreadable(wallet: String) {
        #expect(WalletAmount.read(wallet, fallback: .uzs) == .problem(.unreadable))
    }

    @Test(
        "доллары с одной точкой или запятой и тремя цифрами — это не копейки и не наверняка тысячи: не угадывается",
        arguments: ["12.345 USD", "1.500 USD", "1,500 USD", "$1,234"]
    )
    func ambiguousDollars(wallet: String) {
        #expect(WalletAmount.read(wallet) == .problem(.unreadable))
    }

    @Test("то же для суммы без валюты, когда автоматизация говорит «доллар»")
    func ambiguousDollarsFromAutomation() {
        #expect(WalletAmount.read("0.125", fallback: .usd) == .problem(.unreadable))
        #expect(WalletAmount.read("1.500", fallback: .usd) == .problem(.unreadable))
    }

    @Test("сумы без копеек с точкой или запятой между тысячами читаются; доллары с копейками и тысячами — тоже")
    func unambiguousGrouping() {
        #expect(WalletAmount.read("28.000 сум") == .amount("28000", .uzs))
        #expect(WalletAmount.read("1,500", fallback: .uzs) == .amount("1500", .uzs))
        #expect(WalletAmount.read("1,234,567 USD") == .amount("1234567", .usd))
        #expect(WalletAmount.read("$1,500.00") == .amount("1500.00", .usd))
    }

    @Test("больше 1 000 000 000 — сервер такую запись не берёт")
    func tooLarge() {
        #expect(WalletAmount.read("1 000 000 000,00 UZS") == .amount("1000000000.00", .uzs))
        #expect(WalletAmount.read("1 000 000 000,01 UZS") == .problem(.tooLarge))
        #expect(WalletAmount.read("12 000 000 000 UZS") == .problem(.tooLarge))
    }

    @Test("ведущие нули отбрасываются: сервер их не берёт")
    func leadingZeros() {
        #expect(WalletAmount.read("007,50 USD") == .amount("7.50", .usd))
    }
}
