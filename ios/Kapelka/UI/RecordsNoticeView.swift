import SwiftUI

extension View {
    /// The bar of «Записи»' list at the bottom of a tab, over the tab bar — the same one on «Записи» and «Записать»
    /// (FT-252): «Удалить» on the card deletes through the list, and «Вернуть» is where the tap was. VoiceOver hears it
    /// once, from `RootView`.
    func recordsNoticeBar(_ list: RecordsList) -> some View {
        safeAreaInset(edge: .bottom) {
            if let notice = list.notice {
                RecordsNoticeView(
                    notice: notice,
                    restore: { Task { await list.restoreDeleted() } },
                    dismiss: list.dismissNotice
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.default, value: list.notice)
    }
}

/// The bar at the bottom of «Записи» and «Записать» (FT-221, FT-252): what went wrong with an edit, then «Удалено»
/// («Удалено 2» for the records of a phrase) with «Вернуть». Plain
/// `Text` and `Button` over the tab bar. While «Вернуть» is on its way the button is off next to a `ProgressView`.
/// At the accessibility sizes the button goes under the text: side by side both broke by syllables («Уда-лено»).
/// VoiceOver closes the bar with «Закрыть» or the escape gesture — with it on the bar does not go by itself.
struct RecordsNoticeView: View {
    let notice: RecordsNotice
    let restore: () -> Void
    let dismiss: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let message = notice.message {
                Text(message)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let undo = notice.undo {
                undoRow(undo)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .background(.bar)
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Закрыть", dismiss)
        .accessibilityAction(.escape, dismiss)
    }

    private func undoRow(_ undo: RecordsNotice.Undo) -> some View {
        let layout = RecordRowLayout.stacks(at: typeSize)
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            Text(undo.label)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 8) {
                if undo.isRestoring {
                    ProgressView()
                }
                Button("Вернуть", action: restore)
                    .buttonStyle(.bordered)
                    .disabled(undo.isRestoring)
            }
        }
    }
}
