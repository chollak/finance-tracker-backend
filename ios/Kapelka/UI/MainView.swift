import SwiftUI

/// The one screen of this slice: a field for the phrase and what the queue is doing. Voice, the list and the
/// commands come in FT-178.
struct MainView: View {
    let model: AppModel

    @State private var text = ""
    @State private var error: String?
    @State private var showsSettings = false
    @FocusState private var fieldFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("кофе 25к", text: $text)
                        .focused($fieldFocused)
                        .submitLabel(.send)
                        .onSubmit(save)
                    Button("Записать", action: save)
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } footer: {
                    if let error {
                        Text(error)
                    }
                }

                Section {
                    Text(model.statusLine)
                    if model.pendingCount > 0 {
                        Button("Отправить сейчас") {
                            Task { await model.sendNow() }
                        }
                    }
                }
            }
            .navigationTitle("Kapelka")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showsSettings = true
                    } label: {
                        Label("Настройки", systemImage: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showsSettings) {
                SettingsView(model: model)
            }
            .onAppear {
                if model.isConfigured {
                    fieldFocused = true
                } else {
                    showsSettings = true
                }
            }
        }
        .tint(.primary)
    }

    private func save() {
        let phrase = text
        Task {
            do {
                try await model.add(phrase)
                text = ""
                error = nil
            } catch CaptureTextError.empty {
                error = nil
            } catch CaptureTextError.tooLong {
                error = "Длиннее \(CaptureText.maxLength) символов — сократи"
            } catch {
                self.error = "Не сохранилось на телефоне: \(error.localizedDescription)"
            }
        }
    }
}
