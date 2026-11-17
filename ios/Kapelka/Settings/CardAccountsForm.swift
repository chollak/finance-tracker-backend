import Foundation
import Observation

/// The line under a card's account in the settings.
struct CardAccountNote: Equatable, Sendable {
    let text: String
    /// The card's payments will come with «Нужно проверить» until an account is chosen.
    let isWarning: Bool
}

/// «Карты → счета» of the settings sheet (#415): the cards as edited, and each card's account chosen from the
/// server's accounts — the visible ones, with their currency. While the list is away (no network, the PC asleep, no
/// token) the saved value stays and the name can be typed, as before #415. Nothing is written before «Сохранить».
@MainActor
@Observable
final class CardAccountsForm {
    enum List: Equatable {
        case loading
        /// The accounts on offer.
        case loaded([RecordAccount])
        /// Why the list did not come; «Повторить» asks again.
        case failed(RecordsFailure)
    }

    /// What the picker of a card holds.
    enum Selection: Hashable {
        /// «Не выбран».
        case none
        case account(String)
        /// The saved name that is no account on offer: kept until another is chosen.
        case stale
    }

    private(set) var rows: [CardAccount]
    /// Swiped away; «Сохранить» removes them.
    private(set) var removed: Set<String> = []
    private(set) var list: List = .loading

    private var issues: [String: CardAccountIssue] = [:]
    private let accounts: @Sendable () async -> Result<[RecordAccount], RecordsFailure>

    init(cards: [CardAccount], accounts: @escaping @Sendable () async -> Result<[RecordAccount], RecordsFailure>) {
        rows = cards
        self.accounts = accounts
    }

    /// As the sheet opens, and «Повторить». Without cards there is nothing to choose for: no request.
    func load() async {
        guard !rows.isEmpty else { return }
        list = .loading
        switch await accounts() {
        case let .success(all):
            // The rows of this moment: a card swiped away meanwhile stays away, a name typed before «Повторить» counts
            let resolved = rows.map { CardAccountChoice.resolve($0, in: all) }
            rows = resolved.map(\.card)
            issues = Dictionary(
                resolved.compactMap { row in row.issue.map { (row.card.card, $0) } },
                uniquingKeysWith: { first, _ in first }
            )
            list = .loaded(CardAccountChoice.offered(all))
        case let .failure(failure):
            issues = [:]
            list = .failed(failure)
        }
    }

    func selection(of card: String) -> Selection {
        guard let row = row(card) else { return .none }
        if case let .loaded(offered) = list, let id = row.accountId, offered.contains(where: { $0.id == id }) {
            return .account(id)
        }
        return row.account.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .none : .stale
    }

    /// «Нет такого счёта», «Счёт скрыт»: the picker's item for a saved name that is not on offer; `nil` without one.
    func staleLabel(of card: String) -> String? {
        guard selection(of: card) == .stale else { return nil }
        switch issues[card] {
        case .hidden: return "Счёт скрыт"
        default: return "Нет такого счёта"
        }
    }

    func choose(_ selection: Selection, for card: String) {
        switch selection {
        case .stale:
            return
        case .none:
            change(card) { CardAccount(card: $0.card, account: "", currency: $0.currency) }
        case let .account(id):
            guard case let .loaded(offered) = list, let account = offered.first(where: { $0.id == id }) else { return }
            change(card) {
                CardAccount(card: $0.card, account: account.name, accountId: account.id, currency: $0.currency)
            }
        }
        issues[card] = nil
    }

    /// The name typed by hand while the list is away: it goes without an id, and the next reading of the list finds
    /// its account. The same name keeps the id.
    func type(_ name: String, for card: String) {
        guard let row = row(card), row.account != name else { return }
        change(card) { CardAccount(card: $0.card, account: name, currency: $0.currency) }
        issues[card] = nil
    }

    func setCurrency(_ currency: PaymentCurrency?, for card: String) {
        change(card) { CardAccount(card: $0.card, account: $0.account, accountId: $0.accountId, currency: currency) }
    }

    func remove(at offsets: IndexSet) {
        removed.formUnion(offsets.map { rows[$0].card })
        rows = rows.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)
    }

    /// What to say under the card's account; `nil` — the account is simply chosen.
    func note(for card: String) -> CardAccountNote? {
        guard let row = row(card) else { return nil }
        switch issues[card] {
        case let .renamed(from):
            return CardAccountNote(
                text: "Счёт переименован в Kapelka: был «\(from)». Оплаты идут на него, как раньше.",
                isWarning: false
            )
        case let .missing(name):
            return CardAccountNote(text: "Счёта «\(name)» нет в Kapelka — выбери из списка. \(Self.untilChosen)", isWarning: true)
        case let .hidden(name):
            return CardAccountNote(text: "Счёт «\(name)» скрыт в Kapelka — выбери другой. \(Self.untilChosen)", isWarning: true)
        case nil:
            guard row.account.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return CardAccountNote(text: "Без счёта оплаты этой карты придут с пометкой «Нужно проверить».", isWarning: true)
        }
    }

    /// The reason in the words of «Записи» (`RecordsFailure.title`), and the way that is left.
    static func failureText(_ failure: RecordsFailure) -> String {
        "\(failure.title) — список счетов не загрузился. Имя счёта можно ввести руками: целиком, как в Kapelka."
    }

    private static let untilChosen = "Пока он не выбран, оплаты придут с пометкой «Нужно проверить»."

    private func row(_ card: String) -> CardAccount? {
        rows.first { $0.card == card }
    }

    private func change(_ card: String, _ edit: (CardAccount) -> CardAccount) {
        rows = rows.map { $0.card == card ? edit($0) : $0 }
    }
}
