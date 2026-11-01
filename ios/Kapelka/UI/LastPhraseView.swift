import SwiftUI

/// The card «Последняя фраза» (FT-252): a `List` section of `Label`s with system icons, standard components only. A
/// written line opens its record in «Записи»; «Удалить» does what the phrase's state allows.
struct LastPhraseSection: View {
    let phrase: LastPhrase
    let open: (OpenTarget) -> Void
    let openSettings: () -> Void
    let sendNow: () -> Void
    let delete: (LastPhrase.Deletion) -> Void

    var body: some View {
        Section("Последняя фраза") {
            Label {
                Text(phrase.heard)
            } icon: {
                Image(systemName: "text.bubble")
            }
            ForEach(phrase.lines) { line in
                if let target = line.opens {
                    Button {
                        open(target)
                    } label: {
                        LastPhraseLineView(line: line, opens: true)
                    }
                    .accessibilityHint("Открыть во вкладке «Записи»")
                } else {
                    LastPhraseLineView(line: line, opens: false)
                }
            }
            if let footnote = phrase.footnote {
                Text(footnote)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let note = phrase.note {
                Text(note)
                    .font(.footnote)
            }
            if phrase.opensSettings {
                Button("Настройки", action: openSettings)
            }
            if phrase.offersSendNow {
                Button("Отправить сейчас", action: sendNow)
            }
            if let deletion = phrase.deletion {
                Button(role: .destructive) {
                    delete(deletion)
                } label: {
                    Label("Удалить", systemImage: "trash")
                }
                // Red, as the swipes: the screen's black-or-white tint would make it white on white in the dark theme
                .foregroundStyle(.red)
                .accessibilityLabel(Self.deleteLabel(deletion))
            }
        }
    }

    private static func deleteLabel(_ deletion: LastPhrase.Deletion) -> String {
        switch deletion {
        case .fromPhone: "Удалить с телефона"
        case let .onServer(items) where items.count > 1: "Удалить \(WrittenText.records(items.count))"
        case .onServer: "Удалить запись"
        }
    }
}

private struct LastPhraseLineView: View {
    let line: LastPhrase.Line
    let opens: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text(line.text)
                        // In a button: without its own style the text would take the tint
                        .foregroundStyle(line.kind == .deleted ? .secondary : .primary)
                        .fixedSize(horizontal: false, vertical: true)
                    explanation
                }
            } icon: {
                icon
            }
            if opens {
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder
    private var explanation: some View {
        switch line.explanation {
        case let .assumed(lines)?:
            VStack(alignment: .leading, spacing: 2) {
                Text(RecordReview.assumedTitle)
                    .font(.footnote.weight(.semibold))
                ForEach(lines, id: \.self) { Text($0) }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        case .unsure?:
            Text(RecordReview.unsureText)
                .font(.footnote)
                .foregroundStyle(.secondary)
        case nil:
            EmptyView()
        }
    }

    @ViewBuilder
    private var icon: some View {
        switch line.kind {
        case .sending:
            ProgressView()
        case .review:
            Image(systemName: "exclamationmark.circle")
                .foregroundStyle(.orange)
        default:
            Image(systemName: Self.systemImage(line.kind))
                .foregroundStyle(.secondary)
        }
    }

    private static func systemImage(_ kind: LastPhrase.Line.Kind) -> String {
        switch kind {
        case .sending: "arrow.up.circle"
        case .offline: "wifi.slash"
        case .noAnswer: "clock"
        case .busy: "hourglass"
        case .notConfigured: "gearshape"
        case .tokenRefused: "key"
        case .written: "checkmark.circle"
        case .review: "exclamationmark.circle"
        case .deleted: "trash"
        case .withoutAmount: "questionmark.circle"
        case .notFound: "questionmark.circle"
        case .refused: "xmark.circle"
        }
    }
}
