/// Amounts as the Mini App shows them (`formatMinor` in `webapp/src/shared/lib/money`, `docs/pastel/money-model.md`):
/// a real minus or «+», digit groups by a non-breaking space, сумы whole, dollars with cents after a comma —
/// «−25 000 сум», «+1 200,50 $». Integer arithmetic only: amounts are hundredths, never `Double`.
enum MoneyText {
    enum Sign {
        /// A minus for a negative amount only.
        case auto
        /// «+» for a positive one too.
        case always
    }

    static let minus = "\u{2212}"
    static let nonBreakingSpace = "\u{00A0}"

    /// A record's amount with its direction: income «+», expense «−».
    static func signed(_ record: Record) -> String {
        let minor = record.type == .expense ? -record.amountMinor : record.amountMinor
        return format(minor: minor, currency: record.currency, sign: .always)
    }

    static func format(minor: Int, currency: String, sign: Sign = .auto) -> String {
        let magnitude = minor.magnitude
        let body: String
        if currency == "UZS" {
            // Half a сум and more rounds up, as `Math.round` does in the Mini App
            body = grouped((magnitude + 50) / 100)
        } else {
            let cents = magnitude % 100
            body = "\(grouped(magnitude / 100)),\(cents < 10 ? "0" : "")\(cents)"
        }
        let prefix = minor < 0 ? minus : (sign == .always && minor > 0 ? "+" : "")
        return "\(prefix)\(body)\(nonBreakingSpace)\(unit(currency))"
    }

    private static func unit(_ currency: String) -> String {
        switch currency {
        case "UZS": "сум"
        case "USD": "$"
        default: currency
        }
    }

    private static func grouped(_ number: UInt) -> String {
        let digits = Array(String(number))
        return digits.enumerated().reduce(into: "") { text, pair in
            let (index, digit) = pair
            if index > 0 && (digits.count - index) % 3 == 0 {
                text += nonBreakingSpace
            }
            text.append(digit)
        }
    }
}
