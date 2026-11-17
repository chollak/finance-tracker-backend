import SwiftUI

/// The settings sheet: the PC's address in the tailnet, the token, «Проверить связь», Wallet cards → accounts and how to
/// set up what iOS lets no app set up itself.
struct SettingsView: View {
    /// Opens the Shortcuts app, where the automation «Транзакция» is made.
    private static let shortcutsApp = URL(string: "shortcuts://")

    let model: AppModel

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var address: String
    @State private var token = ""
    /// Read from Keychain once, as the sheet opens (#284) — not on each redraw, which is each letter typed.
    @State private var hasToken = false
    /// «Карты → счета»: the cards as edited and the server's accounts to choose from (#415).
    @State private var cardAccounts: CardAccountsForm
    @State private var checkLine = ConnectionCheckLine()
    @State private var error: String?
    @FocusState private var addressFocused: Bool
    /// The token's field is UIKit's (#338): `@FocusState` does not reach it.
    @State private var tokenFocused = false

    init(model: AppModel) {
        self.model = model
        _address = State(initialValue: model.services.settings.address?.absoluteString ?? "")
        _cardAccounts = State(initialValue: CardAccountsForm(cards: model.cards) { await model.cardAccounts() })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://пк.tailnet.ts.net", text: $address)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($addressFocused)
                } header: {
                    Text("Адрес сервера")
                } footer: {
                    Text("Адрес ПК в tailnet, как у Mini App.")
                }

                Section {
                    TokenField(
                        placeholder: hasToken ? "Сохранён — вставь новый, чтобы заменить" : "Токен",
                        text: $token,
                        isFocused: $tokenFocused
                    )
                } header: {
                    Text("Токен")
                } footer: {
                    Text("SHORTCUT_CAPTURE_TOKEN с ПК. Хранится только в Keychain телефона.")
                }

                Section {
                    Button("Проверить связь", action: check)
                        .disabled(checkLine.isChecking)
                    if checkLine.isChecking {
                        ProgressView()
                    } else if let text = checkLine.text {
                        Text(text)
                    }
                }

                if let error {
                    Section {
                        Text(error)
                    }
                }

                cardsSection

                // iOS lets no app create the automation: once by hand (FT-161, FT-179)
                Section {
                    Text("1. Быстрые команды → Автоматизация → «+» → «Транзакция» (на iOS 26 — «Wallet»).\n"
                        + "2. Отметь свои карты, выбери «Выполнять сразу» → «Далее» → «Новая пустая автоматизация».\n"
                        + "3. «Добавить действие» → Kapelka → «Записать оплату».\n"
                        + "4. Нажми «Сумма» → над клавиатурой «Ввод команды», нажми на него и выбери «Сумма». "
                        + "Так же «Магазин» — продавец, «Карта» — карта.\n"
                        + "5. Нажми «Код валюты» → «Ввод команды», нажми на него → «Тип»: «Сумма в валюте» → "
                        + "«Код валюты».\n"
                        + "Автоматизация уже есть — открой её, сделай шаги 4 и 5, а в «Показать больше» очисти "
                        + "«Сумма текстом (старое)»: с ним остаётся «Сбой автоматизации».")
                    if let shortcuts = Self.shortcutsApp {
                        Button("Открыть Быстрые команды") { openURL(shortcuts) }
                    }
                } header: {
                    Text("Оплаты Apple Pay")
                } footer: {
                    Text("Итог каждой оплаты — уведомление, оно уходит само; без уведомлений оплата пишется тихо, итог — "
                        + "в списке. Без сети оплата ждёт на телефоне. Если оплаты уже записывала своя быстрая команда — "
                        + "выключи её автоматизацию, иначе каждая запишется дважды. Голосом оплату Apple Pay не повторяй.")
                }

                // iOS lets no app set these up itself: once by hand (FT-161)
                Section {
                    Text("Настройки → Кнопка действия → листай до «Быстрая команда» → «Выбрать быструю команду» → "
                        + "Kapelka → «Записать трату».")
                } header: {
                    Text("Кнопка действия")
                } footer: {
                    Text("Нажал, сказал «кофе 25 тысяч» — после паузы запись в очереди и уходит на сервер.")
                }

                Section {
                    Text("Настройки → Основные → Клавиатура: включи «Диктовку» и добавь клавиатуру «Русская». "
                        + "iOS скачает русскую диктовку по Wi-Fi.")
                } header: {
                    Text("Голос без сети")
                } footer: {
                    Text("Распознаёт сам телефон, звук никуда не уходит. Без русской диктовки на телефоне — только текст.")
                }

                Section {
                    Text("Быстрые команды → Автоматизация → «+» → Wi-Fi → домашняя сеть → «Выполнять сразу» → "
                        + "«Отправить очередь».")
                } header: {
                    Text("Отправлять дома")
                } footer: {
                    Text("Необязательно: очередь и так уходит, когда открываешь приложение или появляется сеть.")
                }

                // Why the Wallet automation fails now and then: iOS leaves no other trace (#241)
                Section {
                    NavigationLink("Журнал команд") {
                        CommandJournalView(load: model.journalRuns)
                    }
                } footer: {
                    Text("Что делали «Записать оплату», «Записать трату» и «Отправить очередь»: шаги, время, итог. "
                        + "Хранится только на телефоне, на сервер не уходит.")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            // The answer was for the fields as they were (#283)
            .onChange(of: address) { checkLine.fieldsChanged() }
            .onChange(of: token) { checkLine.fieldsChanged() }
            .navigationTitle("Настройки")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить", action: save)
                }
            }
        }
        .tint(.primary)
        // Once per opening: «Журнал команд» and back stays in this stack
        .onAppear { hasToken = model.hasToken }
        // With the saved address and token: the fields above count from «Сохранить»
        .task { await cardAccounts.load() }
    }

    private var cardsSection: some View {
        Section {
            if cardAccounts.rows.isEmpty {
                Text("Карта появится здесь после первой оплаты Apple Pay.")
                    .foregroundStyle(.secondary)
            } else {
                accountListState
            }
            ForEach(cardAccounts.rows) { row in
                VStack(alignment: .leading, spacing: 8) {
                    Text(row.card)
                        .font(.headline)
                    accountField(row)
                    if let note = cardAccounts.note(for: row.card) {
                        Label {
                            Text(note.text)
                        } icon: {
                            Image(systemName: note.isWarning ? "exclamationmark.circle" : "info.circle")
                                .foregroundStyle(note.isWarning ? Color.orange : Color.secondary)
                        }
                        .font(.footnote)
                    }
                    Picker("Валюта", selection: currency(of: row)) {
                        Text("Как в сумме").tag(PaymentCurrency?.none)
                        Text("Сум").tag(PaymentCurrency?.some(.uzs))
                        Text("Доллар").tag(PaymentCurrency?.some(.usd))
                    }
                }
                // The note's icon would move the row's separator in to the note's text
                .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
            }
            .onDelete { cardAccounts.remove(at: $0) }
        } header: {
            Text("Карты → счета")
        } footer: {
            Text("Счёт — из счетов Kapelka. Без счёта оплата ляжет на счёт по умолчанию с пометкой «Нужно "
                + "проверить». Валюта карты — для суммы, в которой Wallet не пишет код.")
        }
    }

    /// Over the cards: the list of accounts is on its way, or why it did not come.
    @ViewBuilder private var accountListState: some View {
        switch cardAccounts.list {
        case .loading:
            HStack(spacing: 8) {
                ProgressView()
                Text("Загружаю счета…")
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
        case .loaded:
            EmptyView()
        case let .failed(failure):
            Text(CardAccountsForm.failureText(failure))
            Button("Повторить") {
                Task { await cardAccounts.load() }
            }
        }
    }

    /// The card's account: chosen from the server's accounts; typed by hand while they are away; as saved while they
    /// are on their way.
    @ViewBuilder
    private func accountField(_ row: CardAccount) -> some View {
        switch cardAccounts.list {
        case .loading:
            LabeledContent("Счёт", value: row.account.isEmpty ? "Не выбран" : row.account)
        case let .loaded(accounts):
            Picker("Счёт", selection: Binding(
                get: { cardAccounts.selection(of: row.card) },
                set: { cardAccounts.choose($0, for: row.card) }
            )) {
                Text("Не выбран").tag(CardAccountsForm.Selection.none)
                if let stale = cardAccounts.staleLabel(of: row.card) {
                    Text(stale).tag(CardAccountsForm.Selection.stale)
                }
                ForEach(accounts) { account in
                    Text(CardAccountChoice.label(account)).tag(CardAccountsForm.Selection.account(account.id))
                }
            }
        case .failed:
            LabeledContent("Счёт") {
                TextField("Имя счёта", text: Binding(
                    get: { row.account },
                    set: { cardAccounts.type($0, for: row.card) }
                ))
                .multilineTextAlignment(.trailing)
                .autocorrectionDisabled()
            }
        }
    }

    private func currency(of row: CardAccount) -> Binding<PaymentCurrency?> {
        Binding(
            get: { row.currency },
            set: { cardAccounts.setCurrency($0, for: row.card) }
        )
    }

    private func check() {
        // The answer is under the fields: the keyboard would cover it
        addressFocused = false
        tokenFocused = false
        let check = checkLine.start()
        let (address, token) = (address, token)
        Task {
            let answer = await model.checkConnection(address: address, token: token)
            checkLine.finish(check, with: answer)
        }
    }

    private func save() {
        Task {
            do throws(SettingsError) {
                try await model.saveSettings(
                    address: address,
                    token: token,
                    cards: cardAccounts.rows,
                    removedCards: cardAccounts.removed
                )
                dismiss()
            } catch {
                self.error = SettingsMessage.text(for: error)
            }
        }
    }
}
