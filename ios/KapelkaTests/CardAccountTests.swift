import Foundation
import Testing
@testable import Kapelka

/// Wallet cards → Kapelka accounts in the settings (FT-179): a card appears by itself after its first payment; its
/// account is chosen from the server's list and kept with its id (#415), typed by hand only while the list is away.
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

    // MARK: - The account chosen from the server's list (#415)

    private static let accounts = [
        RecordAccount(id: "acc-card", name: "Карта TBC", currency: "UZS"),
        RecordAccount(id: "acc-usd", name: "Доллары", currency: "USD"),
        RecordAccount(id: "acc-old", name: "Старая карта", currency: "UZS", isHidden: true),
    ]

    @Test("выбранный счёт хранится с id: оплата уходит с его именем, id переживает новый экземпляр")
    func chosenAccountKeepsItsId() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card")], removing: [])

        #expect(store.account(for: "TBC Uzbekistan") == "Карта TBC")
        #expect(try makeStore().cards == [
            CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card"),
        ])
    }

    @Test("«Не выбран» стирает и имя, и id")
    func noAccountDropsTheId() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card")], removing: [])
        try store.save([CardAccount(card: "TBC Uzbekistan", account: " ", accountId: "acc-card")], removing: [])

        #expect(store.cards == [CardAccount(card: "TBC Uzbekistan", account: "")])
    }

    @Test("настройки прошлой сборки: имя, введённое руками и совпавшее целиком, молча получает id; валюта и остальные карты на месте")
    func olderMappingAdoptsTheId() throws {
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.set(
            Data(#"""
                [{"card":"TBC Uzbekistan","account":" карта  tbc","currency":"UZS"},
                 {"card":"Visa Kapitalbank","account":"","currency":"USD"},
                 {"card":"Humo","account":"Зарплатная"}]
                """#.utf8),
            forKey: "cardAccounts"
        )
        let store = try makeStore()
        #expect(store.account(for: "TBC Uzbekistan") == "карта  tbc")

        store.reconcile(with: Self.accounts)

        #expect(try makeStore().cards == [
            CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card", currency: .uzs),
            CardAccount(card: "Visa Kapitalbank", account: "", currency: .usd),
            CardAccount(card: "Humo", account: "Зарплатная"),
        ])
    }

    @Test("счёт переименовали на сервере: по id оплата уходит уже с новым именем")
    func renamedAccountFollowsItsId() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "Карта", accountId: "acc-card")], removing: [])

        store.reconcile(with: Self.accounts)

        #expect(store.account(for: "TBC Uzbekistan") == "Карта TBC")
        #expect(store.cards.first?.accountId == "acc-card")
    }

    @Test("счёта нет в списке — сохранённое не трогается и уходит как раньше; пустой список ничего не стирает")
    func missingAccountStaysAsSaved() throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        let saved = [CardAccount(card: "TBC Uzbekistan", account: "Карта ТБС")]
        try store.save(saved, removing: [])

        store.reconcile(with: Self.accounts)
        #expect(store.cards == saved)
        store.reconcile(with: [])
        #expect(store.cards == saved)
        #expect(store.account(for: "TBC Uzbekistan") == "Карта ТБС")
    }

    @Test("счёт скрыт: имя остаётся на телефоне, но с оплатой не уходит — сервер ставит счёт по умолчанию и пометку")
    func hiddenAccountIsNotSent() throws {
        let store = try makeStore()
        store.noticed("Humo")
        try store.save([CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old", currency: .uzs)], removing: [])

        store.reconcile(with: Self.accounts)

        let kept = CardAccount(
            card: "Humo", account: "Старая карта", accountId: "acc-old", accountHidden: true, currency: .uzs
        )
        #expect(store.cards == [kept])
        #expect(store.account(for: "Humo") == nil)
        // A list without the account (a partial answer) does not bring the name back
        store.reconcile(with: [])
        #expect(try makeStore().cards == [kept])
        #expect(try makeStore().account(for: "Humo") == nil)
    }

    @Test("имя прошлой сборки, без id, совпало со скрытым счётом — не выбрано: помечено скрытым и не уходит")
    func typedNameOfHiddenAccountIsNotChosen() throws {
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.set(Data(#"[{"card":"Humo","account":"старая  карта"}]"#.utf8), forKey: "cardAccounts")
        let store = try makeStore()
        #expect(store.account(for: "Humo") == "старая  карта")

        store.reconcile(with: Self.accounts)

        #expect(store.cards == [
            CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old", accountHidden: true),
        ])
        #expect(store.account(for: "Humo") == nil)
    }

    @Test("счёт скрыли и переименовали, а его прежнее имя теперь у другого видимого счёта — оплата на тот счёт молча не уходит")
    func hiddenAccountsOldNameOnAnotherAccount() throws {
        let store = try makeStore()
        store.noticed("Humo")
        try store.save([CardAccount(card: "Humo", account: "Зарплатная", accountId: "acc-old")], removing: [])

        store.reconcile(with: Self.accounts + [RecordAccount(id: "acc-new", name: "Зарплатная", currency: "UZS")])

        #expect(store.cards == [
            CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old", accountHidden: true),
        ])
        #expect(store.account(for: "Humo") == nil)
    }

    @Test("скрытый счёт снова показали — карта выбрана, как была, и имя уходит")
    func shownAgainAccountIsSent() throws {
        let store = try makeStore()
        store.noticed("Humo")
        try store.save([CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old")], removing: [])
        store.reconcile(with: Self.accounts)

        store.reconcile(with: [RecordAccount(id: "acc-old", name: "Старая карта", currency: "UZS")])

        #expect(store.cards == [CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old")])
        #expect(store.account(for: "Humo") == "Старая карта")
    }

    @Test("«Сохранить» пометку скрытого счёта не снимает; новое имя руками или «Не выбран» — снимает")
    func savingKeepsTheHiddenMark() throws {
        let store = try makeStore()
        store.noticed("Humo")
        let hidden = CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old", accountHidden: true)
        try store.save([hidden], removing: [])
        #expect(store.cards == [hidden])
        #expect(store.account(for: "Humo") == nil)

        try store.save([CardAccount(card: "Humo", account: "Карта TBC")], removing: [])
        #expect(store.account(for: "Humo") == "Карта TBC")
    }

    // MARK: - Reading the list reaches the store (#415)

    @Test("чтение списка счетов сразу доводит переименование и id до хранилища — и до следующей оплаты, без «Сохранить»")
    func readingTheListReconcilesTheStore() async throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        try store.save([CardAccount(card: "TBC Uzbekistan", account: "Карта", accountId: "acc-card")], removing: [])
        let accounts = Self.accounts
        let source = CardAccountsSource(cards: store) { () async throws(RecordsFailure) in accounts }

        #expect(await source.read() == .success(accounts))

        #expect(store.account(for: "TBC Uzbekistan") == "Карта TBC")
    }

    @Test("список не пришёл — причина возвращается, хранилище не меняется")
    func failedReadingLeavesTheStore() async throws {
        let store = try makeStore()
        store.noticed("TBC Uzbekistan")
        let saved = [CardAccount(card: "TBC Uzbekistan", account: "Карта", accountId: "acc-card")]
        try store.save(saved, removing: [])
        let source = CardAccountsSource(cards: store) { () async throws(RecordsFailure) in throw .later(.offline) }

        #expect(await source.read() == .failure(.later(.offline)))

        #expect(store.cards == saved)
    }
}
