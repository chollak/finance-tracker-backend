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
    @State private var cards: [CardAccount]
    @State private var removedCards: Set<String> = []
    @State private var checkLine = ConnectionCheckLine()
    @State private var error: String?
    @FocusState private var focusedField: Field?

    private enum Field {
        case address
        case token
    }

    init(model: AppModel) {
        self.model = model
        _address = State(initialValue: model.services.settings.address?.absoluteString ?? "")
        _cards = State(initialValue: model.cards)
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
                        .focused($focusedField, equals: .address)
                } header: {
                    Text("Адрес сервера")
                } footer: {
                    Text("Адрес ПК в tailnet, как у Mini App.")
                }

                Section {
                    SecureField(model.hasToken ? "Сохранён — вставь новый, чтобы заменить" : "Токен", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .token)
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
                        + "4. Нажми «Сумма» → над клавиатурой «Ввод команды», нажми на него и выбери сумму. "
                        + "Так же «Магазин» — продавец, «Карта» — карта.")
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
    }

    private var cardsSection: some View {
        Section {
            if cards.isEmpty {
                Text("Карта появится здесь после первой оплаты Apple Pay.")
                    .foregroundStyle(.secondary)
            }
            ForEach($cards) { $row in
                VStack(alignment: .leading, spacing: 8) {
                    LabeledContent(row.card) {
                        TextField("Счёт", text: $row.account)
                            .multilineTextAlignment(.trailing)
                            .autocorrectionDisabled()
                    }
                    Picker("Валюта", selection: $row.currency) {
                        Text("Как в сумме").tag(PaymentCurrency?.none)
                        Text("Сум").tag(PaymentCurrency?.some(.uzs))
                        Text("Доллар").tag(PaymentCurrency?.some(.usd))
                    }
                }
            }
            .onDelete { offsets in
                removedCards.formUnion(offsets.map { cards[$0].card })
                cards.remove(atOffsets: offsets)
            }
        } header: {
            Text("Карты → счета")
        } footer: {
            Text("Имя счёта целиком, как в Kapelka. Пусто или не совпало — оплата ляжет на счёт по умолчанию "
                + "с пометкой «проверить счёт». Валюта карты — для суммы, в которой Wallet не пишет код.")
        }
    }

    private func check() {
        // The answer is under the fields: the keyboard would cover it
        focusedField = nil
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
                try await model.saveSettings(address: address, token: token, cards: cards, removedCards: removedCards)
                dismiss()
            } catch {
                self.error = SettingsMessage.text(for: error)
            }
        }
    }
}
