import SwiftUI

/// The tab «Записать» (FT-178, FT-220): the microphone and what it heard, a field for typing, the answer to the last
/// phrase and what in the queue needs attention. A written record goes to «Записи». «Записать трату» from the Action
/// Button lands here already listening (`RootView`).
struct CaptureView: View {
    let model: AppModel
    let openSettings: () -> Void

    @State private var text = ""
    @State private var error: String?
    @FocusState private var fieldFocused: Bool
    @Environment(\.openURL) private var openURL

    private var voice: VoiceCapture { model.voice }

    var body: some View {
        NavigationStack {
            List {
                voiceSection
                typingSection
                queueSection
                let rows = model.attentionRows
                if !rows.isEmpty {
                    attentionSection(rows)
                }
            }
            .navigationTitle("Kapelka")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SettingsButton(action: openSettings)
                }
            }
            // The Action Button starts the microphone from any tab: the keyboard gives way to it
            .onChange(of: voice.phase) {
                if voice.phase != .idle {
                    fieldFocused = false
                }
            }
            .onChange(of: voice.problemCount) {
                guard let problem = voice.problem, problem.needsKeyboard else { return }
                // What was heard before recognition broke off is not lost: it waits in the field
                if text.isEmpty {
                    text = voice.transcript
                }
                fieldFocused = true
            }
        }
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

    /// Waiting, sending, refused, «не нашёл операцию»: what is not in «Записи».
    private func attentionSection(_ rows: [CaptureRow]) -> some View {
        Section("Требует внимания") {
            ForEach(rows) { row in
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
                        if row.canDismiss {
                            Button {
                                Task { error = await model.dismiss(row.id) }
                            } label: {
                                Label("Убрать", systemImage: "xmark")
                            }
                            .tint(Color(uiColor: .systemGray))
                        }
                    }
            }
        }
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
