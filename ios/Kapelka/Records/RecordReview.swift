import Foundation

/// Why a record of «Записи» has «!» (FT-254). The general phrase always comes first: the server flags a phrase for
/// reasons the queue does not keep — the AI unsure, «вернули» (`flagRepaymentWording`), an amount it corrected — while
/// its guesses (`assumptions`) come with almost every phrase: the default account alone is one. So the guesses are
/// details under the phrase, never the reason itself (review of PR #170, the coordinator's choice «а»).
struct RecordReview: Equatable, Sendable {
    /// «Что я предположил»: a line per guess, from the answer the queue kept for the record (FT-255,
    /// `QueueState.answer(for:)`); empty when there is none to show.
    let assumed: [String]

    static let unsureText = "Сервер не был уверен — проверь сумму, категорию и счёт"

    /// First in the sheet, always: why the server flagged it is not kept on the phone.
    var reason: String { Self.unsureText }
    static let assumedTitle = "Что я предположил"
    /// Under the reason: the sheet changes the category only (decision 2026-10-31).
    static let editedElsewhere = "Сумма и счёт правятся в Mini App"

    /// The guesses only while the record is as the server wrote it — the same category, account, amount and currency
    /// as the kept answer: changed since, they may be stale, and the answer is a snapshot of that moment. None for a
    /// record from the bot or the Mini App, one sent by a build before FT-255, a repeat after a lost answer (it comes
    /// without assumptions), or one whose only «guess» is the account the phrase named.
    static func of(_ record: Record, answer: CapturedRecord?) -> RecordReview {
        guard let answer, isAsWritten(record, answer) else { return RecordReview(assumed: []) }
        return RecordReview(assumed: lines(answer.assumptions, category: record.category))
    }

    /// A line per guess — here and on the card of «Записать» (FT-252). The category by its name now, when there is one:
    /// a rename keeps its id.
    static func lines(_ assumptions: [CaptureAssumption], category: String) -> [String] {
        assumptions.compactMap { line($0, category: category) }
    }

    private static func isAsWritten(_ record: Record, _ answer: CapturedRecord) -> Bool {
        record.categoryId == answer.categoryId
            && record.accountId == answer.accountId
            && record.amountMinor == answer.amountMinor
            && record.currency == answer.currency
    }

    /// The account the phrase named is no guess.
    private static func line(_ assumption: CaptureAssumption, category: String) -> String? {
        switch assumption {
        case let .thousands(written, amount):
            "«\(written)» понял как \(MoneyText.format(minor: amount * 100, currency: "UZS"))"
        case let .category(name):
            "Категорию «\(category.isEmpty ? name : category)» выбрал сам"
        case let .account(name, reason):
            reason == .byDefault ? "Счёт «\(name)» — по умолчанию" : nil
        case .currency(_, .noUsdAccount):
            "Доллары — на сумовом счёте: долларового нет"
        }
    }
}
