import Foundation

/// Why a record of «Записи» has «!» (FT-254): what the parse took for granted, from the answer the queue kept for it
/// (FT-255, `QueueState.answer(for:)`), or the general phrase.
enum RecordReview: Equatable, Sendable {
    /// «Что я предположил»: a line per guess.
    case assumed([String])
    /// «Сервер не был уверен — проверь сумму, категорию и счёт».
    case unsure

    static let assumedTitle = "Что я предположил"
    static let unsureText = "Сервер не был уверен — проверь сумму, категорию и счёт"
    /// Under the reason: the sheet changes the category only (decision 2026-10-31).
    static let editedElsewhere = "Сумма и счёт правятся в Mini App"

    /// The guesses only while the record is as the server wrote it — the same category, account, amount and currency
    /// as the kept answer: changed since, they may be stale, and the answer is a snapshot of that moment. The general
    /// phrase for the rest: a record from the bot or the Mini App, one sent by a build before FT-255, a repeat after a
    /// lost answer (it comes without assumptions), one whose only «guess» is the account the phrase named, and a
    /// record flagged for a reason of its own (`createTransaction.ts`, `processTextInput.ts`).
    static func of(_ record: Record, answer: CapturedRecord?) -> RecordReview {
        guard let answer, isAsWritten(record, answer) else { return .unsure }
        let lines = answer.assumptions.compactMap { line($0, record: record) }
        return lines.isEmpty ? .unsure : .assumed(lines)
    }

    private static func isAsWritten(_ record: Record, _ answer: CapturedRecord) -> Bool {
        record.categoryId == answer.categoryId
            && record.accountId == answer.accountId
            && record.amountMinor == answer.amountMinor
            && record.currency == answer.currency
    }

    /// The account the phrase named is no guess. The category by the record's name now: a rename keeps its id.
    private static func line(_ assumption: CaptureAssumption, record: Record) -> String? {
        switch assumption {
        case let .thousands(written, amount):
            "«\(written)» понял как \(MoneyText.format(minor: amount * 100, currency: "UZS"))"
        case let .category(name):
            "Категорию «\(record.category.isEmpty ? name : record.category)» выбрал сам"
        case let .account(name, reason):
            reason == .byDefault ? "Счёт «\(name)» — по умолчанию" : nil
        case .currency(_, .noUsdAccount):
            "Доллары — на сумовом счёте: долларового нет"
        }
    }
}
