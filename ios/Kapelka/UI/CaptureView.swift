import SwiftUI

/// The tab «Записать» (FT-178, FT-220): the microphone and what it heard, a field for typing, the card of the last
/// phrase (FT-252) and what else in the queue needs attention. A written record goes to «Записи». «Записать трату»
/// from the Action Button lands here already listening (`RootView`).
struct CaptureView: View {
    let model: AppModel
    let openSettings: () -> Void
    /// A tap on a written record of the card: «Записи», scrolled to it (FT-254).
    let open: (OpenTarget) -> Void

    @State private var text = ""
    @State private var error: String?
    @FocusState private var fieldFocused: Bool
    @Environment(\.openURL) private var openURL

    private var voice: VoiceCapture { model.voice }

    /// Long enough for the focus to come back and the list to insert the card's new rows, short enough to read as one
    /// movement.
    private static let scrollDelay: Duration = .milliseconds(250)

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                let phrase = model.lastPhrase
                list(phrase)
                    // Typed with Return, the field keeps the keyboard up, and the card under it would hide behind
                    // it: as the phrase moves on — new, «Отправляю…», «Записал» — its end comes into sight over the
                    // keyboard (review of PR #171). Voice or no keyboard — the list stays where it is.
                    .onChange(of: phrase?.progress) {
                        // Checked after a moment: Return takes the focus off the field, and `save()` gives it back only
                        // once the phrase is on the phone — right when the card changes. By then the list has also laid
                        // the new rows out; in the same update the row was not there yet
                        Task {
                            try? await Task.sleep(for: Self.scrollDelay)
                            guard fieldFocused, let shown = model.lastPhrase else { return }
                            withAnimation {
                                proxy.scrollTo(LastPhraseSection.end(of: shown), anchor: .bottom)
                            }
                        }
                    }
            }
            // «Удалено N · Вернуть» of the card's «Удалить» — the bar of «Записи», here too
            .recordsNoticeBar(model.records)
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

    private func list(_ phrase: LastPhrase?) -> some View {
        List {
            voiceSection
            typingSection
            if let phrase {
                LastPhraseSection(
                    phrase: phrase,
                    open: open,
                    openSettings: openSettings,
                    sendNow: sendNow,
                    delete: { deletion in Task { await model.card.delete(deletion) } }
                )
            }
            let rows = model.attentionRows(excluding: phrase?.id)
            if !rows.isEmpty {
                attentionSection(rows, offersSendNow: phrase?.offersSendNow != true)
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
                    .foregroundStyle(voiceCaption == Self.prompt ? .secondary : .primary)
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

    /// The words while listening; once the phrase is written the card says «Услышал: …», and the prompt is back.
    private var voiceCaption: String {
        switch voice.phase {
        case .starting: return "Включаю микрофон…"
        case .listening where voice.transcript.isEmpty: return "Слушаю…"
        case .idle: return Self.prompt
        default: return voice.transcript.isEmpty ? Self.prompt : voice.transcript
        }
    }

    private static let prompt = "Нажми и скажи: «кофе 25 тысяч»"

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

    private func sendNow() {
        Task { await model.sendNow() }
    }

    /// Waiting, sending, refused, «не нашёл операцию»: what is not in «Записи», the card's phrase left out. «Отправить
    /// сейчас» here when the card does not offer it already.
    private func attentionSection(_ rows: [CaptureRow], offersSendNow: Bool) -> some View {
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
                            // Red, as «Удалить» on «Записи»: the screen's black-or-white tint would make it white on
                            // white in the dark theme
                            .tint(.red)
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
            // After a refused token only new settings send again
            if offersSendNow, rows.contains(where: { $0.kind == .waiting }), model.isConfigured,
               !model.queueState.tokenRefused {
                Button("Отправить сейчас", action: sendNow)
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
