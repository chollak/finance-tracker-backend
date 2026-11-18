import Foundation
import Testing
@testable import Kapelka

/// «Карты → счета» in the settings (#415): the account of a card is chosen from the server's list — the visible
/// accounts, each with its currency — instead of typed. The list away, the saved value stays and the name can be
/// typed, as before. A saved name that is no account's is said so, not sent silently.
@MainActor
@Suite("Настройки: счёт карты из списка")
struct CardAccountsFormTests {
    private static let card = RecordAccount(id: "acc-card", name: "Карта TBC", currency: "UZS")
    private static let dollars = RecordAccount(id: "acc-usd", name: "Доллары", currency: "USD")
    private static let old = RecordAccount(id: "acc-old", name: "Старая карта", currency: "UZS", isHidden: true)
    private static let accounts = [card, dollars, old]

    private func form(
        _ cards: [CardAccount],
        answers: [Result<[RecordAccount], RecordsFailure>] = [.success(accounts)]
    ) -> CardAccountsForm {
        let script = Script(answers)
        return CardAccountsForm(cards: cards) { await script.next() }
    }

    // MARK: - Выбор

    @Test("список пришёл: предлагаются только видимые счета, у каждого валюта")
    func offersVisibleAccountsWithCurrency() async {
        let form = form([CardAccount(card: "TBC Uzbekistan", account: "")])
        #expect(form.list == .loading)

        await form.load()

        #expect(form.list == .loaded([Self.card, Self.dollars]))
        #expect(CardAccountChoice.label(Self.card) == "Карта TBC · сум")
        #expect(CardAccountChoice.label(Self.dollars) == "Доллары · USD")
        #expect(CardAccountChoice.label(RecordAccount(id: "x", name: "Без валюты")) == "Без валюты")
    }

    @Test("выбор счёта пишет его имя и id; «Не выбран» — отдельный пункт и стирает оба")
    func choosingAnAccount() async {
        let form = form([CardAccount(card: "TBC Uzbekistan", account: "", currency: .uzs)])
        await form.load()
        #expect(form.selection(of: "TBC Uzbekistan") == CardAccountsForm.Selection.none)

        form.choose(.account("acc-card"), for: "TBC Uzbekistan")
        #expect(form.rows == [
            CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card", currency: .uzs),
        ])
        #expect(form.selection(of: "TBC Uzbekistan") == .account("acc-card"))
        #expect(form.note(for: "TBC Uzbekistan") == nil)

        form.choose(.none, for: "TBC Uzbekistan")
        #expect(form.rows == [CardAccount(card: "TBC Uzbekistan", account: "", currency: .uzs)])
    }

    @Test("карта без счёта заметна: её оплаты придут с пометкой «Нужно проверить»")
    func cardWithoutAccountIsNoticed() async {
        let form = form([CardAccount(card: "TBC Uzbekistan", account: "")])
        await form.load()

        #expect(form.note(for: "TBC Uzbekistan") == CardAccountNote(
            text: "Без счёта оплаты этой карты придут с пометкой «Нужно проверить».",
            isWarning: true
        ))
    }

    @Test("имя прошлой сборки, совпавшее со счётом целиком — без регистра, «ё» и лишних пробелов, — молча выбрано")
    func typedNameThatMatchesIsChosen() async {
        let form = form([CardAccount(card: "TBC Uzbekistan", account: "  карта  tbc ")])
        await form.load()

        #expect(form.selection(of: "TBC Uzbekistan") == .account("acc-card"))
        #expect(form.rows == [CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card")])
        #expect(form.note(for: "TBC Uzbekistan") == nil)
    }

    // MARK: - Устаревшее имя

    @Test("имени нет среди счетов: «нет такого счёта» и подсказка выбрать; сохранённое не меняется, пока не выбран другой")
    func staleNameIsSaid() async {
        let saved = CardAccount(card: "TBC Uzbekistan", account: "Карта ТБС")
        let form = form([saved])
        await form.load()

        #expect(form.selection(of: "TBC Uzbekistan") == .stale)
        #expect(form.staleLabel(of: "TBC Uzbekistan") == "Нет такого счёта")
        #expect(form.note(for: "TBC Uzbekistan") == CardAccountNote(
            text: "Счёта «Карта ТБС» нет в Kapelka — выбери из списка. "
                + "Пока он не выбран, оплаты придут с пометкой «Нужно проверить».",
            isWarning: true
        ))
        #expect(form.rows == [saved])

        form.choose(.account("acc-usd"), for: "TBC Uzbekistan")
        #expect(form.staleLabel(of: "TBC Uzbekistan") == nil)
        #expect(form.note(for: "TBC Uzbekistan") == nil)
        #expect(form.rows == [CardAccount(card: "TBC Uzbekistan", account: "Доллары", accountId: "acc-usd")])
    }

    @Test("счёт скрыли в Mini App: в списке его нет, строка говорит «скрыт» и просит выбрать другой")
    func hiddenAccountIsSaid() async {
        let form = form([CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old")])
        await form.load()

        #expect(form.selection(of: "Humo") == .stale)
        #expect(form.staleLabel(of: "Humo") == "Счёт скрыт")
        #expect(form.note(for: "Humo") == CardAccountNote(
            text: "Счёт «Старая карта» скрыт в Kapelka — выбери другой. "
                + "Пока он не выбран, оплаты придут с пометкой «Нужно проверить».",
            isWarning: true
        ))
    }

    @Test("имя прошлой сборки, без id, совпало со скрытым счётом — не выбрано: «Счёт скрыт» с предупреждением")
    func typedNameOfHiddenAccountIsNotChosen() async {
        let form = form([CardAccount(card: "Humo", account: " старая  карта", currency: .uzs)])
        await form.load()

        #expect(form.selection(of: "Humo") == .stale)
        #expect(form.staleLabel(of: "Humo") == "Счёт скрыт")
        #expect(form.selectionLabel(of: "Humo") == "Счёт скрыт")
        #expect(form.note(for: "Humo")?.isWarning == true)
        #expect(form.rows == [
            CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old", accountHidden: true, currency: .uzs),
        ])
    }

    @Test("счёт скрыли и переименовали, а его прежнее имя теперь у другого видимого счёта: экран говорит «скрыт», тот счёт сам не выбирается")
    func hiddenAccountsOldNameOnAnotherAccount() async {
        let other = RecordAccount(id: "acc-new", name: "Зарплатная", currency: "UZS")
        let form = form(
            [CardAccount(card: "Humo", account: "Зарплатная", accountId: "acc-old")],
            answers: [.success(Self.accounts + [other])]
        )
        await form.load()

        #expect(form.selection(of: "Humo") == .stale)
        #expect(form.note(for: "Humo")?.text.hasPrefix("Счёт «Старая карта» скрыт в Kapelka") == true)
        #expect(form.rows.first?.isAccountHidden == true)

        // The owner's own choice of that account is a choice like any other
        form.choose(.account("acc-new"), for: "Humo")
        #expect(form.rows == [CardAccount(card: "Humo", account: "Зарплатная", accountId: "acc-new")])
        #expect(form.note(for: "Humo") == nil)
    }

    @Test("скрытый счёт и список не пришёл: предупреждение остаётся, смена валюты пометку не снимает")
    func hiddenMarkWithoutTheList() async {
        let hidden = CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old", accountHidden: true)
        let form = form([hidden], answers: [.failure(.later(.offline))])
        await form.load()

        #expect(form.note(for: "Humo")?.text.hasPrefix("Счёт «Старая карта» скрыт в Kapelka") == true)
        form.setCurrency(.usd, for: "Humo")
        #expect(form.rows == [
            CardAccount(card: "Humo", account: "Старая карта", accountId: "acc-old", accountHidden: true, currency: .usd),
        ])
    }

    // MARK: - Валюта карты и счёта

    private static let otherCurrency = "в другой валюте, чем карта. Оплаты этой карты придут с пометкой «Нужно проверить»."

    @Test("карта в сумах, счёт в долларах: предупреждение под счётом; выбор не сбрасывается")
    func sumCardWithDollarAccount() async {
        let form = form([CardAccount(card: "TBC Uzbekistan", account: "", currency: .uzs)])
        await form.load()

        form.choose(.account("acc-usd"), for: "TBC Uzbekistan")

        #expect(form.note(for: "TBC Uzbekistan") == CardAccountNote(
            text: "Счёт «Доллары» \(Self.otherCurrency)",
            isWarning: true
        ))
        #expect(form.selection(of: "TBC Uzbekistan") == .account("acc-usd"))
        #expect(form.selectionLabel(of: "TBC Uzbekistan") == "Доллары · USD")
        #expect(form.rows == [
            CardAccount(card: "TBC Uzbekistan", account: "Доллары", accountId: "acc-usd", currency: .uzs),
        ])
    }

    @Test("карта в долларах, счёт в сумах: то же предупреждение — и когда счёт выбран раньше, и когда он ещё и переименован")
    func dollarCardWithSumAccount() async {
        let form = form([CardAccount(card: "Visa Kapitalbank", account: "Карта", accountId: "acc-card", currency: .usd)])
        await form.load()

        #expect(form.note(for: "Visa Kapitalbank") == CardAccountNote(
            text: "Счёт «Карта TBC» \(Self.otherCurrency)",
            isWarning: true
        ))
        #expect(form.selection(of: "Visa Kapitalbank") == .account("acc-card"))
    }

    @Test("валюта карты «Как в сумме»: предупреждения нет; сменили валюту карты — появляется и уходит")
    func cardWithoutCurrency() async {
        let form = form([CardAccount(card: "TBC Uzbekistan", account: "Доллары", accountId: "acc-usd")])
        await form.load()
        #expect(form.note(for: "TBC Uzbekistan") == nil)

        form.setCurrency(.uzs, for: "TBC Uzbekistan")
        #expect(form.note(for: "TBC Uzbekistan")?.isWarning == true)

        form.setCurrency(.usd, for: "TBC Uzbekistan")
        #expect(form.note(for: "TBC Uzbekistan") == nil)
        form.setCurrency(nil, for: "TBC Uzbekistan")
        #expect(form.note(for: "TBC Uzbekistan") == nil)
    }

    @Test("валюты совпали или сервер не назвал валюту счёта — предупреждения нет")
    func sameOrUnknownCurrency() async {
        let noCurrency = RecordAccount(id: "acc-x", name: "Без валюты")
        let form = form(
            [
                CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card", currency: .uzs),
                CardAccount(card: "Humo", account: "Без валюты", accountId: "acc-x", currency: .usd),
            ],
            answers: [.success(Self.accounts + [noCurrency])]
        )
        await form.load()

        #expect(form.note(for: "TBC Uzbekistan") == nil)
        #expect(form.note(for: "Humo") == nil)
        #expect(form.selectionLabel(of: "TBC Uzbekistan") == "Карта TBC · сум")
    }

    @Test("счёт переименовали на сервере: по id он выбран с новым именем, строка говорит, как он назывался")
    func renamedAccountIsSaid() async {
        let form = form([CardAccount(card: "TBC Uzbekistan", account: "Карта", accountId: "acc-card")])
        await form.load()

        #expect(form.selection(of: "TBC Uzbekistan") == .account("acc-card"))
        #expect(form.rows == [CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card")])
        #expect(form.note(for: "TBC Uzbekistan") == CardAccountNote(
            text: "Счёт переименован в Kapelka: был «Карта». Оплаты идут на него, как раньше.",
            isWarning: false
        ))
    }

    @Test("счёт удалён, а счёт с тем же именем есть — выбран он; имени нет — «нет такого счёта»")
    func deletedAccountFallsBackToItsName() async {
        let form = form([
            CardAccount(card: "TBC Uzbekistan", account: "Доллары", accountId: "acc-gone"),
            CardAccount(card: "Humo", account: "Зарплатная", accountId: "acc-gone-too"),
        ])
        await form.load()

        #expect(form.selection(of: "TBC Uzbekistan") == .account("acc-usd"))
        #expect(form.selection(of: "Humo") == .stale)
        #expect(form.staleLabel(of: "Humo") == "Нет такого счёта")
    }

    // MARK: - Список недоступен

    @Test(
        "список не пришёл: причина словами «Записей», прежнее значение на месте, имя можно ввести руками",
        arguments: [
            (RecordsFailure.later(.offline), "Нет связи"),
            (.later(.noAnswer), "Сервер не ответил"),
            (.later(.busy), "Сервер просит подождать"),
            (.tokenRefused, "Сервер не принял токен"),
            (.notConfigured, "Нет адреса и токена"),
            (.refused, "Сервер не принял запрос"),
        ]
    )
    func listUnavailable(failure: RecordsFailure, reason: String) async {
        let saved = CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card", currency: .uzs)
        let form = form([saved], answers: [.failure(failure)])
        await form.load()

        #expect(form.list == .failed(failure))
        #expect(CardAccountsForm.failureText(failure)
            == "\(reason) — список счетов не загрузился. Имя счёта можно ввести руками: целиком, как в Kapelka.")
        #expect(form.rows == [saved])
        #expect(form.note(for: "TBC Uzbekistan") == nil)
    }

    @Test("имя, введённое руками, уходит без id: его сверит следующее чтение списка; то же имя id не теряет")
    func typingByHand() async {
        let form = form(
            [CardAccount(card: "TBC Uzbekistan", account: "Карта TBC", accountId: "acc-card")],
            answers: [.failure(.later(.offline)), .success(Self.accounts)]
        )
        await form.load()

        form.type("Карта TBC", for: "TBC Uzbekistan")
        #expect(form.rows.first?.accountId == "acc-card")

        form.type("доллары", for: "TBC Uzbekistan")
        #expect(form.rows == [CardAccount(card: "TBC Uzbekistan", account: "доллары")])

        // «Повторить»: the list came, and the typed name is an account's
        await form.load()
        #expect(form.rows == [CardAccount(card: "TBC Uzbekistan", account: "Доллары", accountId: "acc-usd")])
    }

    @Test("нет карт — список счетов не запрашивается")
    func noCardsNoRequest() async {
        let script = Script([.success(Self.accounts)])
        let form = CardAccountsForm(cards: []) { await script.next() }
        await form.load()

        #expect(await script.asked == 0)
    }

    // MARK: - Остальное в строке

    @Test("валюта карты и удаление карты не зависят от списка счетов; карта, убранная, пока список в пути, не возвращается")
    func currencyAndRemoval() async {
        let form = form([
            CardAccount(card: "TBC Uzbekistan", account: "Карта TBC"),
            CardAccount(card: "Humo", account: ""),
        ])
        form.setCurrency(.usd, for: "Humo")
        form.remove(at: IndexSet(integer: 0))
        await form.load()

        #expect(form.rows == [CardAccount(card: "Humo", account: "", currency: .usd)])
        #expect(form.removed == ["TBC Uzbekistan"])
    }
}

/// The server's answers to «список счетов», in order; the last one repeats.
private actor Script {
    private var answers: [Result<[RecordAccount], RecordsFailure>]
    private(set) var asked = 0

    init(_ answers: [Result<[RecordAccount], RecordsFailure>]) {
        self.answers = answers
    }

    func next() -> Result<[RecordAccount], RecordsFailure> {
        asked += 1
        return answers.count > 1 ? answers.removeFirst() : answers[0]
    }
}
