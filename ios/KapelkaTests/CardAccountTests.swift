import Foundation
import Testing
@testable import Kapelka

/// Wallet cards → Kapelka accounts in the settings (FT-179): a card appears by itself after its first payment, the
/// account's name is typed by hand.
@Suite("Карты → счета")
final class CardAccountTests {
    private let suite = "kapelka-tests-cards-\(UUID().uuidString)"

    deinit {
        UserDefaults.standard.removePersistentDomain(forName: suite)
    }

    private func makeStore() throws -> CardAccountStore {
        CardAccountStore(defaults: try #require(UserDefaults(suiteName: suite)))
    }

    @Test("новая карта появляется после первой оплаты, без счёта; повторная — не дублируется")
    func cardAppearsOnFirstPayment() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        store.noticed("Visa Kapitalbank")
        store.noticed("TBC Uzbekistan")

        #expect(store.cards == [
            CardAccount(card: "TBC Uzbekistan", account: ""),
            CardAccount(card: "Visa Kapitalbank", account: ""),
        ])
        #expect(store.account(for: "TBC Uzbekistan") == nil)
    }

    @Test("оплата без карты ничего не добавляет")
    func noCardNoRow() throws {
        let store = try makeStore()
        store.noticed(nil)
        store.noticed("  ")
        #expect(store.cards.isEmpty)
    }

    @Test("счёт введён — оплата этой карты уходит с ним; без пробелов по краям")
    func mappedAccount() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "  Карта TBC ")], removing: [])

        #expect(store.account(for: "TBC Uzbekistan") == "Карта TBC")
        #expect(store.account(for: "Visa Kapitalbank") == nil)
    }

    @Test("пустое поле — карта без счёта: сервер ставит счёт по умолчанию и «проверить счёт»")
    func clearedAccount() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "Карта")], removing: [])
        try store.save([CardAccount(card: "TBC Uzbekistan", account: " ")], removing: [])

        #expect(store.account(for: "TBC Uzbekistan") == nil)
        #expect(store.cards.map(\.card) == ["TBC Uzbekistan"])
    }

    @Test("имя счёта длиннее 100 символов не сохраняется: сервер не примет такую оплату")
    func accountTooLong() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")

        #expect(throws: CardAccountError.tooLong("TBC Uzbekistan")) {
            try store.save([CardAccount(card: "TBC Uzbekistan", account: String(repeating: "к", count: 101))], removing: [])
        }
        #expect(store.account(for: "TBC Uzbekistan") == nil)
        try store.save([CardAccount(card: "TBC Uzbekistan", account: String(repeating: "к", count: 100))], removing: [])
    }

    @Test("карта, пришедшая, пока открыты настройки, не теряется при сохранении")
    func newCardSurvivesSave() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        let shown = store.cards
        store.noticed("Visa Kapitalbank")

        try store.save(shown.map { CardAccount(card: $0.card, account: "Карта") }, removing: [])

        #expect(store.cards.map(\.card) == ["TBC Uzbekistan", "Visa Kapitalbank"])
        #expect(store.account(for: "TBC Uzbekistan") == "Карта")
    }

    @Test("карту можно убрать из списка; следующая оплата вернёт её без счёта")
    func removeCard() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "Карта")], removing: [])
        try store.save([], removing: ["TBC Uzbekistan"])
        #expect(store.cards.isEmpty)

        store.noticed("TBC Uzbekistan")
        #expect(store.account(for: "TBC Uzbekistan") == nil)
    }

    @Test("сопоставление переживает новый экземпляр — как после переустановки поверх")
    func survivesNewInstance() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "Карта")], removing: [])

        #expect(try makeStore().account(for: "TBC Uzbekistan") == "Карта")
    }

    @Test("валюта карты сохраняется вместе со счётом; не выбрана — её нет")
    func cardCurrency() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        store.noticed("Visa Kapitalbank")
        try store.save([
            CardAccount(card: "TBC Uzbekistan", account: "Карта", currency: .uzs),
            CardAccount(card: "Visa Kapitalbank", account: "", currency: .usd),
        ], removing: [])

        #expect(store.currency(for: "TBC Uzbekistan") == .uzs)
        #expect(store.currency(for: "Visa Kapitalbank") == .usd)
        #expect(try makeStore().currency(for: " Visa  Kapitalbank ") == .usd)

        try store.save([CardAccount(card: "Visa Kapitalbank", account: "", currency: nil)], removing: [])
        #expect(store.currency(for: "Visa Kapitalbank") == nil)
        #expect(store.currency(for: "Другая карта") == nil)
    }

    @Test("сопоставление прошлой сборки, без валюты, читается: счёт на месте, валюты нет")
    func olderMappingWithoutCurrency() throws {
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.set(Data(#"[{"card":"TBC Uzbekistan","account":"Карта"}]"#.utf8), forKey: "cardAccounts")
        let store = try makeStore()

        #expect(store.cards == [CardAccount(card: "TBC Uzbekistan", account: "Карта")])
        #expect(store.account(for: "TBC Uzbekistan") == "Карта")
        #expect(store.currency(for: "TBC Uzbekistan") == nil)
    }

    @Test("нечитаемое сопоставление откладывается рядом, а не затирается следующей картой")
    func unreadableMappingSetAside() throws {
        let defaults = try #require(UserDefaults(suiteName: suite))
        let broken = Data("{ не json".utf8)
        defaults.set(broken, forKey: "cardAccounts")
        let store = try makeStore()

        store.noticed("TBC Uzbekistan")

        #expect(store.cards.map(\.card) == ["TBC Uzbekistan"])
        let aside = defaults.dictionaryRepresentation().filter { $0.key.hasPrefix("cardAccounts.unreadable-") }
        #expect(aside.values.compactMap { $0 as? Data } == [broken])
    }

    @Test("карта сравнивается так же, как её запишет оплата: пробелы внутри сведены")
    func cardNameTidied() throws {
        let store = try makeStore()
        store.noticed(" TBC  Uzbekistan ")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "Карта")], removing: [])

        #expect(store.cards.map(\.card) == ["TBC Uzbekistan"])
        #expect(store.account(for: "TBC Uzbekistan") == "Карта")
    }
}
