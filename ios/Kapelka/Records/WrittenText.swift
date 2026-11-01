import Foundation

/// «Записал: …» — what the server wrote, in the words of the bot and the server's ack, for the notifications (FT-253)
/// and the card of «Записать» (FT-252): the note or the merchant, the category — with «?» when the parse guessed it,
/// as the ack and the bot's board show it — and the amount with its sign through `MoneyText`.
enum WrittenText {
    /// «кофе · Кафе · −45 000 сум», «KORZINKA 24 · Продукты? · −25 000 сум»; a note that is the category is not repeated.
    static func line(_ record: CapturedRecord) -> String {
        let note = record.description.trimmingCharacters(in: .whitespacesAndNewlines)
        let category = record.category.trimmingCharacters(in: .whitespacesAndNewlines)
        let guessed = record.assumptions.contains { assumption in
            if case .category = assumption { true } else { false }
        }
        let minor = record.type == .expense ? -record.amountMinor : record.amountMinor
        return [
            note.isEmpty || same(note, category) ? nil : note,
            category.isEmpty ? nil : (guessed ? "\(category)?" : category),
            MoneyText.format(minor: minor, currency: record.currency, sign: .always),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    /// «Записал: …», or «Записал, проверь: …» when the server is unsure of it.
    static func wrote(_ record: CapturedRecord) -> String {
        "\(title(needsReview: record.needsReview)): \(line(record))"
    }

    static func title(needsReview: Bool) -> String {
        needsReview ? "Записал, проверь" : "Записал"
    }

    /// «1 запись», «3 записи», «5 записей».
    static func records(_ count: Int) -> String {
        "\(count) \(RussianPlural.form(count, one: "запись", few: "записи", many: "записей"))"
    }

    /// As the server compares names: without case and «ё».
    private static func same(_ a: String, _ b: String) -> Bool {
        folded(a) == folded(b)
    }

    private static func folded(_ text: String) -> String {
        text.lowercased().replacingOccurrences(of: "ё", with: "е")
    }
}

enum RussianPlural {
    /// 1, 21 — `one`; 2–4, 22–24 — `few`; 5–20, 25–30, 11–14 — `many`.
    static func form(_ count: Int, one: String, few: String, many: String) -> String {
        let lastTwo = count.magnitude % 100
        let last = count.magnitude % 10
        if (11...14).contains(lastTwo) { return many }
        switch last {
        case 1: return one
        case 2...4: return few
        default: return many
        }
    }
}
