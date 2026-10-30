import Foundation

/// One Wallet card and the Kapelka account its payments go to; an empty account — none.
struct CardAccount: Codable, Equatable, Identifiable, Sendable {
    let card: String
    var account: String

    var id: String { card }
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

    /// The settings' «Сохранить»: accounts of the cards shown, by card, and the cards swiped away. A card that came
    /// while the settings were open keeps its place. Nothing is written when one name is too long.
    func save(_ accounts: [String: String], removing removed: Set<String>) throws(CardAccountError) {
        try Self.check(accounts)
        let trimmed = accounts.mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        lock.withLock {
            let cards = load()
                .filter { !removed.contains($0.card) }
                .map { CardAccount(card: $0.card, account: trimmed[$0.card] ?? $0.account) }
            store(cards)
        }
    }

    /// Before anything of the settings is written: an account's name the server would refuse.
    static func check(_ accounts: [String: String]) throws(CardAccountError) {
        let long = accounts.first { $0.value.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count > accountLimit }
        if let long { throw .tooLong(long.key) }
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
