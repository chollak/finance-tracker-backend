import Foundation

/// What «Записать оплату» gets from the Wallet automation «Транзакция», as the automation passed it.
struct PaymentInput: Equatable, Sendable {
    /// The old field «Сумма текстом (старое)»: Wallet's «Сумма» as text, «28 000,00 UZS». Shortcuts make that text
    /// themselves and crash on it when Wallet has no amount yet (#398); read only when there is no `amountNumber`.
    var amount: String?
    /// Wallet's «Сумма» as a number (#398); 0 when Wallet has none.
    var amountNumber: Double?
    /// Wallet's «Код валюты» of that number: `UZS`, `USD` or another code.
    var amountCurrency: String?
    /// For an amount that names none: the card's currency from the settings, else the one chosen in the automation.
    var currency: PaymentCurrency?
    var merchant: String?
    /// The card's name in Wallet.
    var card: String?
}

/// A card payment in the queue (FT-179). It goes out as fields to `POST /api/quick-capture/payment`, never as a phrase:
/// the phrase parser would read «28 000,00» as 2 800 000 (2026-10-30, the Shortcut before this app).
struct Payment: Codable, Equatable, Sendable {
    /// As Wallet gave it, for the list: «28 000,00 UZS»; a number Wallet gave is written the same way (#398).
    let walletAmount: String
    /// The contract's string, `"28000.00"`; `nil` when the amount stays on the phone.
    let amount: String?
    /// `UZS` or `USD`, or the other currency's code that keeps it on the phone.
    let currency: String?
    let merchant: String?
    /// The card's name in Wallet; the settings map it to a Kapelka account when it is sent.
    let card: String?
}

extension Payment {
    /// The server's limit on `merchant`, in UTF-16 units like JavaScript's `length`.
    static let merchantLimit = 200

    /// What Wallet gave, for the list and a refusal: «Ooo Mazzali Super Food · 28 000,00 UZS»; without an amount (run
    /// by Siri, not Wallet) only the merchant.
    var line: String {
        let amount = walletAmount.trimmingCharacters(in: .whitespacesAndNewlines)
        return [merchant ?? "Оплата Apple Pay", amount.isEmpty ? nil : amount].compactMap { $0 }.joined(separator: " · ")
    }

    /// The contract's amount in hundredths, `"28000.00"` → 2 800 000, for `MoneyText`; `nil` when it stays on the phone.
    /// Integer arithmetic only, like the rest of the money.
    var amountMinor: Int? {
        guard let amount else { return nil }
        let parts = amount.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2, let whole = Int(parts[0]), whole >= 0 else { return nil }
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        guard fraction.count <= 2, fraction.allSatisfy(\.isASCII), fraction.allSatisfy(\.isNumber) else { return nil }
        return whole * 100 + (Int(fraction.padding(toLength: 2, withPad: "0", startingAt: 0)) ?? 0)
    }

    /// The payment as it goes into the queue, and why it stays on the phone when it cannot be sent.
    static func from(_ input: PaymentInput) -> (payment: Payment, problem: String?) {
        let (wallet, read) = amount(of: input)
        let merchant = tidy(input.merchant).map { limited($0, to: merchantLimit) }
        let card = tidy(input.card)
        switch read {
        case let .amount(amount, currency):
            let payment = Payment(walletAmount: wallet, amount: amount, currency: currency.rawValue, merchant: merchant, card: card)
            return (payment, nil)
        case let .problem(problem):
            var code: String?
            if case let .otherCurrency(other) = problem {
                code = other
            }
            let payment = Payment(walletAmount: wallet, amount: nil, currency: code, merchant: merchant, card: card)
            return (payment, problem.reason(wallet: wallet))
        }
    }

    /// The amount for the list and how it reads: the number with «Код валюты» when the automation gives one, else the
    /// old text.
    private static func amount(of input: PaymentInput) -> (wallet: String, read: WalletAmount) {
        if let number = input.amountNumber {
            let read = WalletAmount.read(number: number, code: input.amountCurrency, fallback: input.currency)
            return (WalletAmount.text(number: number, code: input.amountCurrency), read)
        }
        let wallet = input.amount ?? ""
        return (wallet, WalletAmount.read(wallet, fallback: input.currency))
    }

    /// Runs of spaces made one, as the server does; blank is none.
    static func tidy(_ raw: String?) -> String? {
        let words = (raw ?? "").split(whereSeparator: { $0.isWhitespace })
        return words.isEmpty ? nil : words.joined(separator: " ")
    }

    private static func limited(_ text: String, to units: Int) -> String {
        var kept = ""
        for character in text {
            guard kept.utf16.count + character.utf16.count <= units else { break }
            kept.append(character)
        }
        return kept
    }
}

extension WalletAmount.Problem {
    /// Why the payment stays on the phone, for the list.
    func reason(wallet: String) -> String {
        switch self {
        case .missing: "Wallet не передал сумму — запиши в Mini App"
        case .zero: "Wallet передал сумму 0 — запиши в Mini App"
        case .unreadable: "не понял сумму «\(wallet)» — запиши в Mini App"
        case .tooLarge: "больше 1 000 000 000 — сервер такую запись не берёт"
        case .noCurrency: "в сумме нет валюты — укажи валюту карты в настройках Kapelka, а эту оплату запиши в Mini App"
        case let .otherCurrency(code): "валюта \(code) — Kapelka пишет только сумы и доллары, запиши в Mini App"
        }
    }
}
