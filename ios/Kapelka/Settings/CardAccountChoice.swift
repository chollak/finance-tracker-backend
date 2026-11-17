import Foundation

/// Why a card's saved account is not simply one of the server's list (#415).
enum CardAccountIssue: Equatable, Sendable {
    /// The account of the saved id has another name now; the card follows it.
    case renamed(from: String)
    /// The account is hidden in the Mini App: the server takes no payment into it by its name.
    case hidden(String)
    /// No account has this name: typed by hand with a slip, or the account was deleted.
    case missing(String)
}

/// A card's saved account against the accounts the server has (#415). The settings and the store read it the same
/// way, so what the screen shows is what the next payment goes with.
enum CardAccountChoice {
    /// The card as it should be kept, and what to say about it. An account found by its id — or, for a name typed by
    /// hand (a build before #415, or the list was away), by its whole name — is taken with its id and its name of
    /// today. A hidden or a missing one leaves the card as it was saved: its name still goes with a payment, and the
    /// server answers with the default account and «Нужно проверить», as before.
    static func resolve(
        _ card: CardAccount,
        in accounts: [RecordAccount]
    ) -> (card: CardAccount, issue: CardAccountIssue?) {
        let saved = card.account.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !saved.isEmpty else { return (card, nil) }
        let key = nameKey(saved)
        let byId = card.accountId.flatMap { id in accounts.first { $0.id == id } }

        if let byId, !byId.isHidden {
            return (taking(byId, for: card), nameKey(byId.name) == key ? nil : .renamed(from: saved))
        }
        if let byId {
            return (card, .hidden(byId.name))
        }
        // No id, or its account is deleted: the name decides, as it does on the server
        if let byName = accounts.first(where: { !$0.isHidden && nameKey($0.name) == key }) {
            return (taking(byName, for: card), nil)
        }
        if let hidden = accounts.first(where: { $0.isHidden && nameKey($0.name) == key }) {
            return (card, .hidden(hidden.name))
        }
        return (card, .missing(saved))
    }

    /// The accounts a card can take: the server writes a named payment only into a visible one.
    static func offered(_ accounts: [RecordAccount]) -> [RecordAccount] {
        accounts.filter { !$0.isHidden }
    }

    /// «Карта TBC · сум», «Доллары · USD»: the unit as amounts have it (`MoneyText`).
    static func label(_ account: RecordAccount) -> String {
        guard let currency = account.currency else { return account.name }
        return "\(account.name) · \(MoneyText.unit(currency))"
    }

    /// The server's own comparison of account names (`accountNameKey` in `account.ts`): without the case, «ё» and
    /// spaces at the ends, runs of spaces as one.
    static func nameKey(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
            .lowercased(with: Locale(identifier: "ru_RU"))
            .replacingOccurrences(of: "ё", with: "е")
    }

    private static func taking(_ account: RecordAccount, for card: CardAccount) -> CardAccount {
        CardAccount(card: card.card, account: account.name, accountId: account.id, currency: card.currency)
    }
}
