import SwiftUI

/// The one screen (FT-178): the microphone and what it heard, a field for typing, the answer to the last phrase and
/// the recent records. «Записать трату» from the Action Button opens it already listening.
struct MainView: View {
    let model: AppModel

    @State private var text = ""
    @State private var error: String?
    @State private var showsSettings = false
    @FocusState private var fieldFocused: Bool
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL

    private var voice: VoiceCapture { model.voice }
    private var listenRequest: ListenRequest { .shared }

    var body: some View {
        NavigationStack {
            List {
                voiceSection
                typingSection
                queueSection
                if !model.rows.isEmpty {
                    recentSection
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
                // Opened by «Записать трату» before the address is set: listen first, the queue keeps the phrase
                if !model.isConfigured, !listenRequest.isPending {
                    showsSettings = true
                }
                listenIfAsked()
            }
            .onChange(of: listenRequest.isPending) { listenIfAsked() }
            .onChange(of: scenePhase) { listenIfAsked() }
            // A press while the settings were open listens once they close
            .onChange(of: showsSettings) { listenIfAsked() }
            .onChange(of: voice.problemCount) {
                guard let problem = voice.problem, problem.needsKeyboard else { return }
                // What was heard before recognition broke off is not lost: it waits in the field
                if text.isEmpty {
                    text = voice.transcript
                }
                fieldFocused = true
            }
        }
        .tint(.primary)
    }

    private var voiceSection: some View {
        Section {
            VStack(spacing: 12) {
                MicrophoneButton(phase: voice.phase) {
                    fieldFocused = false
                    voice.toggle()
                }
                Text(voiceCaption)
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(voice.transcript.isEmpty ? .secondary : .primary)
                    .frame(maxWidth: .infinity)
                if voice.phase != .idle, voice.phase != .saving {
                    Button("Отмена", action: voice.cancel)
                        .buttonStyle(.borderless)
                }
            }
            .padding(.vertical, 12)

            if let problem = voice.problem {
                Text(problem.message)
                if problem.opensSettings, let settings = URL(string: UIApplication.openSettingsURLString) {
                    Button("Открыть Настройки") { openURL(settings) }
                }
            }
        }
    }

    private var voiceCaption: String {
        switch voice.phase {
        case .starting: return "Включаю микрофон…"
        case .listening where voice.transcript.isEmpty: return "Слушаю…"
        default: return voice.transcript.isEmpty ? "Нажми и скажи: «кофе 25 тысяч»" : voice.transcript
        }
    }

    private var typingSection: some View {
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
    }

    private var queueSection: some View {
        Section {
            Text(model.statusLine)
            // After a refused token only new settings send again
            if model.pendingCount > 0, model.isConfigured, !model.queueState.tokenRefused {
                Button("Отправить сейчас") {
                    Task { await model.sendNow() }
                }
            }
        }
    }

    private var recentSection: some View {
        Section("Последние") {
            ForEach(model.rows) { row in
                CaptureRowView(row: row)
                    .swipeActions {
                        if row.canDelete {
                            Button(role: .destructive) {
                                Task { error = await model.remove(row.id) }
                            } label: {
                                Label("Удалить", systemImage: "trash")
                            }
                            // The screen's black-or-white tint would make it white on white in the dark theme
                            .tint(Color(uiColor: .systemGray))
                        }
                    }
            }
        }
    }

    /// «Записать трату» once the screen is active (the microphone does not start in background) and the settings are
    /// closed — they may hold an address or a token not saved yet. The first press listens, a press while listening ends
    /// the phrase.
    private func listenIfAsked() {
        guard scenePhase == .active, !showsSettings, listenRequest.take() else { return }
        fieldFocused = false
        voice.commandPressed()
    }

    private func save() {
        let phrase = text
        // Cleared at once: Return and a tap on «Записать» together must not save the phrase twice
        text = ""
        Task {
            do {
                try await model.add(phrase)
                error = nil
                // The next phrase follows often: Return must not close the keyboard
                fieldFocused = true
            } catch CaptureTextError.empty {
                error = nil
            } catch CaptureTextError.tooLong {
                text = phrase
                error = "Длиннее \(CaptureText.maxLength) символов — сократи"
            } catch {
                text = phrase
                self.error = "Не сохранилось на телефоне: \(error.localizedDescription)"
            }
        }
    }
}

/// A black circle in light, a white one in dark: the one control the thumb looks for.
private struct MicrophoneButton: View {
    let phase: VoiceCapture.Phase
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: phase == .idle ? "mic.fill" : "stop.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Color(uiColor: .systemBackground))
                .frame(width: 88, height: 88)
                .background(Circle().fill(Color.primary))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .accessibilityLabel(phase == .idle ? "Сказать трату" : "Закончить фразу")
    }
}

private struct CaptureRowView: View {
    let row: CaptureRow

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(row.text)
                if let reason = row.reason {
                    Text(reason)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        } icon: {
            Image(systemName: row.kind.systemImage)
        }
    }
}
