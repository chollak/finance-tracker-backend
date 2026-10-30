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
        try store.save(["TBC Uzbekistan": "  Карта TBC "], removing: [])

        #expect(store.account(for: "TBC Uzbekistan") == "Карта TBC")
        #expect(store.account(for: "Visa Kapitalbank") == nil)
    }

    @Test("пустое поле — карта без счёта: сервер ставит счёт по умолчанию и «проверить счёт»")
    func clearedAccount() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save(["TBC Uzbekistan": "Карта"], removing: [])
        try store.save(["TBC Uzbekistan": " "], removing: [])

        #expect(store.account(for: "TBC Uzbekistan") == nil)
        #expect(store.cards.map(\.card) == ["TBC Uzbekistan"])
    }

    @Test("имя счёта длиннее 100 символов не сохраняется: сервер не примет такую оплату")
    func accountTooLong() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")

        #expect(throws: CardAccountError.tooLong("TBC Uzbekistan")) {
            try store.save(["TBC Uzbekistan": String(repeating: "к", count: 101)], removing: [])
        }
        #expect(store.account(for: "TBC Uzbekistan") == nil)
        try store.save(["TBC Uzbekistan": String(repeating: "к", count: 100)], removing: [])
    }

    @Test("карта, пришедшая, пока открыты настройки, не теряется при сохранении")
    func newCardSurvivesSave() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        let shown = store.cards
        store.noticed("Visa Kapitalbank")

        try store.save(Dictionary(uniqueKeysWithValues: shown.map { ($0.card, "Карта") }), removing: [])

        #expect(store.cards.map(\.card) == ["TBC Uzbekistan", "Visa Kapitalbank"])
        #expect(store.account(for: "TBC Uzbekistan") == "Карта")
    }

    @Test("карту можно убрать из списка; следующая оплата вернёт её без счёта")
    func removeCard() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save(["TBC Uzbekistan": "Карта"], removing: [])
        try store.save([:], removing: ["TBC Uzbekistan"])
        #expect(store.cards.isEmpty)

        store.noticed("TBC Uzbekistan")
        #expect(store.account(for: "TBC Uzbekistan") == nil)
    }

    @Test("сопоставление переживает новый экземпляр — как после переустановки поверх")
    func survivesNewInstance() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save(["TBC Uzbekistan": "Карта"], removing: [])

        #expect(try makeStore().account(for: "TBC Uzbekistan") == "Карта")
    }

    @Test("карта сравнивается так же, как её запишет оплата: пробелы внутри сведены")
    func cardNameTidied() throws {
        let store = try makeStore()
        store.noticed(" TBC  Uzbekistan ")
        try store.save(["TBC Uzbekistan": "Карта"], removing: [])

        #expect(store.cards.map(\.card) == ["TBC Uzbekistan"])
        #expect(store.account(for: "TBC Uzbekistan") == "Карта")
    }
}
