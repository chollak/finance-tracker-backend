import SwiftUI

/// The settings sheet: the PC's address in the tailnet, the token, «Проверить связь».
struct SettingsView: View {
    let model: AppModel

    @Environment(\.dismiss) private var dismiss
    @State private var address: String
    @State private var token = ""
    @State private var checkResult: String?
    @State private var isChecking = false
    @State private var error: String?
    @FocusState private var focusedField: Field?

    private enum Field {
        case address
        case token
    }

    init(model: AppModel) {
        self.model = model
        _address = State(initialValue: model.services.settings.address?.absoluteString ?? "")
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
                        .disabled(isChecking)
                    if isChecking {
                        ProgressView()
                    } else if let checkResult {
                        Text(checkResult)
                    }
                }

                if let error {
                    Section {
                        Text(error)
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
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

    private func check() {
        // The answer is under the fields: the keyboard would cover it
        focusedField = nil
        isChecking = true
        checkResult = nil
        Task {
            checkResult = await model.checkConnection(address: address)
            isChecking = false
        }
    }

    private func save() {
        Task {
            do throws(SettingsError) {
                try await model.saveSettings(address: address, token: token)
                dismiss()
            } catch {
                self.error = SettingsMessage.text(for: error)
            }
        }
    }
}
