import Foundation

/// One Wallet card, the Kapelka account its payments go to (empty — none) and its currency, for a Wallet amount that
/// names none: one automation serves several cards, so its own «Валюта» cannot tell a dollar card from a сум one.
struct CardAccount: Codable, Equatable, Identifiable, Sendable {
    let card: String
    var account: String
    /// A mapping saved before FT-179's review has none.
    var currency: PaymentCurrency?

    var id: String { card }

    init(card: String, account: String, currency: PaymentCurrency? = nil) {
        self.card = card
        self.account = account
        self.currency = currency
    }
}

enum CardAccountError: Error, Equatable {
    /// The account's name of this card is longer than the server takes.
    case tooLong(String)
}

/// Wallet cards → Kapelka accounts (FT-179), in the app's `UserDefaults`. A card appears by itself with its first
/// payment; the account's name is typed by hand, since the token only writes and the app has no list of accounts. The
/// server takes it only as an account's whole name (`docs/QUICK_CAPTURE_API.md`, «What is written»), otherwise the
/// default account and «проверить счёт».
final class CardAccountStore: @unchecked Sendable {
    /// The server's limit on `accountName`.
    static let accountLimit = 100

    private static let key = "cardAccounts"

    private let defaults: UserDefaults
    // UserDefaults is thread-safe; the lock keeps «read, change, write» whole between a payment and the settings
    private let lock = NSLock()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// In the order the cards first paid.
    var cards: [CardAccount] {
        lock.withLock { load() }
    }

    /// A payment of this card came: a card not seen before is added without an account.
    func noticed(_ card: String?) {
        guard let card = Payment.tidy(card) else { return }
        lock.withLock {
            var cards = load()
            guard !cards.contains(where: { $0.card == card }) else { return }
            cards.append(CardAccount(card: card, account: ""))
            store(cards)
        }
    }

    /// The account to send with this card's payment; `nil` — none.
    func account(for card: String) -> String? {
        guard let card = Payment.tidy(card) else { return nil }
        let account = cards.first { $0.card == card }?.account.trimmingCharacters(in: .whitespacesAndNewlines)
        return account?.isEmpty == false ? account : nil
    }

    /// The currency of this card's payments when Wallet's amount names none; `nil` — not chosen.
    func currency(for card: String) -> PaymentCurrency? {
        guard let card = Payment.tidy(card) else { return nil }
        return cards.first { $0.card == card }?.currency
    }

    /// The settings' «Сохранить»: the cards shown, as edited, and the cards swiped away. A card that came while the
    /// settings were open keeps its place. Nothing is written when one name is too long.
    func save(_ edits: [CardAccount], removing removed: Set<String>) throws(CardAccountError) {
        try Self.check(edits)
        let edited = Dictionary(edits.map { ($0.card, $0) }) { _, last in last }
        lock.withLock {
            let cards = load()
                .filter { !removed.contains($0.card) }
                .map { stored -> CardAccount in
                    guard let edit = edited[stored.card] else { return stored }
                    let account = edit.account.trimmingCharacters(in: .whitespacesAndNewlines)
                    return CardAccount(card: stored.card, account: account, currency: edit.currency)
                }
            store(cards)
        }
    }

    /// Before anything of the settings is written: an account's name the server would refuse.
    static func check(_ edits: [CardAccount]) throws(CardAccountError) {
        let long = edits.first { $0.account.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count > accountLimit }
        if let long { throw .tooLong(long.card) }
    }

    /// A mapping that does not decode is moved aside under its own key, not written over by the next card: it can
    /// still be read back by hand.
    private func load() -> [CardAccount] {
        guard let data = defaults.data(forKey: Self.key) else { return [] }
        if let cards = try? JSONDecoder().decode([CardAccount].self, from: data) { return cards }
        defaults.set(data, forKey: "\(Self.key).unreadable-\(Int(Date().timeIntervalSince1970))")
        defaults.removeObject(forKey: Self.key)
        return []
    }

    private func store(_ cards: [CardAccount]) {
        guard let data = try? JSONEncoder().encode(cards) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
