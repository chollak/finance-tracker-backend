import Foundation

/// The two currencies Kapelka writes (decision 2026-10-29, FT-161).
enum PaymentCurrency: String, CaseIterable, Codable, Sendable {
    case uzs = "UZS"
    case usd = "USD"
}

/// Wallet's amount as text, brought to the strict string of `POST /api/quick-capture/payment` (`docs/QUICK_CAPTURE_API.md`,
/// «Payments»): digits with a dot and the decimals as Wallet gave them — «28 000,00 UZS» is `"28000.00"` in `UZS`.
/// Only the text is rewritten, never through `Double`, and nothing is guessed: a format it does not know stays on the
/// phone.
enum WalletAmount: Equatable, Sendable {
    enum Problem: Equatable, Sendable {
        /// No digits at all.
        case missing
        case unreadable
        /// Wallet sends 0 when it has no amount for the payment.
        case zero
        /// Above the limit of a record.
        case tooLarge
        /// Neither the amount nor the automation names a currency.
        case noCurrency
        /// A currency Kapelka does not write; its code is shown in the list.
        case otherCurrency(String)
    }

    case amount(String, PaymentCurrency)
    case problem(Problem)

    /// The server's limit of every record, in major units.
    static let maximum: Decimal = 1_000_000_000

    /// `fallback` — the currency chosen in the automation, for an amount that names none.
    static func read(_ raw: String, fallback: PaymentCurrency? = nil) -> WalletAmount {
        let text = raw.unicodeScalars
            .map { CharacterSet.whitespacesAndNewlines.contains($0) ? " " : String($0) }
            .joined()
        guard
            let first = text.firstIndex(where: \.isASCIIDigit),
            let last = text.lastIndex(where: \.isASCIIDigit)
        else { return .problem(.missing) }

        let marks = String(text[..<first]) + " " + String(text[text.index(after: last)...])
        let currency: PaymentCurrency
        switch CurrencyMark.read(marks) {
        case let .known(known): currency = known
        case let .other(code): return .problem(.otherCurrency(code))
        case .unreadable: return .problem(.unreadable)
        case .none:
            guard let fallback else { return .problem(.noCurrency) }
            currency = fallback
        }

        guard let number = Number.read(String(text[first...last]), currency: currency) else { return .problem(.unreadable) }
        guard let value = Decimal(string: number, locale: Locale(identifier: "en_US_POSIX")) else {
            return .problem(.unreadable)
        }
        if value == 0 { return .problem(.zero) }
        if value > maximum { return .problem(.tooLarge) }
        return .amount(number, currency)
    }
}

/// The currency written next to the number: a code, a symbol or a word.
private enum CurrencyMark {
    case none
    case known(PaymentCurrency)
    case other(String)
    case unreadable

    // A bare «$» is the dollar of a phone set to Russian or Uzbek; a phone in Canada or Australia would write its own
    // dollar this way, and its payments would go out as USD
    private static let words: [String: PaymentCurrency] = [
        "UZS": .uzs, "СУМ": .uzs, "СЎМ": .uzs, "SO'M": .uzs, "SOʻM": .uzs, "SO‘M": .uzs, "SO’M": .uzs, "SUM": .uzs,
        "USD": .usd, "$": .usd, "US$": .usd,
    ]

    private static let otherSymbols: [String: String] = [
        "€": "EUR", "₽": "RUB", "£": "GBP", "₸": "KZT", "¥": "JPY", "₺": "TRY", "₩": "KRW",
    ]

    static func read(_ text: String) -> CurrencyMark {
        let mark = text.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "."))
            .uppercased()
        if mark.isEmpty { return .none }
        if let known = words[mark] { return .known(known) }
        if let code = otherSymbols[mark] { return .other(code) }
        let isCode = mark.count == 3 && mark.unicodeScalars.allSatisfy { ("A"..."Z").contains($0) }
        return isCode ? .other(mark) : .unreadable
    }
}

/// The digits of the amount with Wallet's separators: a space, an apostrophe, a dot or a comma groups thousands; the
/// last dot or comma followed by one or two digits is the decimal point.
private enum Number {
    private static let groupSeparators: Set<Character> = [" ", "'", "’", ".", ","]
    private static let points: Set<Character> = [".", ","]

    /// `"28000.00"`; `nil` for anything else than digits and separators in a form a currency is written in.
    static func read(_ text: String, currency: PaymentCurrency) -> String? {
        guard text.allSatisfy({ $0.isASCIIDigit || groupSeparators.contains($0) }) else { return nil }
        var integer = text
        var fraction: String?
        if let point = text.lastIndex(where: { $0 == "." || $0 == "," }) {
            let decimals = text[text.index(after: point)...]
            let pointMark = text[point]
            // One or two digits after it: the decimal point, which then may not group thousands too
            if (1...2).contains(decimals.count), decimals.allSatisfy(\.isASCIIDigit) {
                integer = String(text[..<point])
                guard !integer.contains(pointMark) else { return nil }
                fraction = String(decimals)
            }
        }
        // «1.500 USD» is fifteen hundred in one locale and one and a half in another; dollars always show their cents
        if fraction == nil, currency == .usd, text.count(where: points.contains) == 1 { return nil }
        guard let digits = groupedDigits(integer) else { return nil }
        let trimmed = String(digits.drop { $0 == "0" })
        let whole = trimmed.isEmpty ? "0" : trimmed
        return fraction.map { "\(whole).\($0)" } ?? whole
    }

    /// `"28 000"` → `"28000"`: in a grouped number the first group is one to three digits without a leading zero and
    /// every other has three, one kind of separator between them — so «0,500» and «1234,567» are not read as thousands.
    private static func groupedDigits(_ text: String) -> String? {
        let groups = text.split(omittingEmptySubsequences: false) { groupSeparators.contains($0) }
        let separators = Set(text.filter { groupSeparators.contains($0) })
        guard let head = groups.first, !head.isEmpty, separators.count <= 1 else { return nil }
        if groups.count > 1 {
            guard
                (1...3).contains(head.count), head.first != "0",
                groups.dropFirst().allSatisfy({ $0.count == 3 })
            else { return nil }
        }
        return groups.joined()
    }
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}
