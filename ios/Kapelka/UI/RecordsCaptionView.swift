import SwiftUI

/// The line over «Записи» (FT-254): «Обновляю…» with a `ProgressView` while the tab refreshes by itself, then
/// «Обновлено N мин назад». `TimelineView` redraws the line alone, each minute from the moment the list came — the
/// list itself is never refreshed on a timer (decision FT-220).
struct RecordsCaptionView: View {
    let list: RecordsList

    var body: some View {
        Group {
            if list.status == .refreshing {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Обновляю…")
                }
            } else {
                TimelineView(.periodic(from: Self.start(of: list.status), by: 60)) { context in
                    Text(list.caption(at: context.date) ?? "")
                }
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
    }

    /// The minutes count from when the list came, so the line turns at «1 мин», «2 мин», not at the clock's minute.
    private static func start(of status: RecordsStatus?) -> Date {
        switch status {
        case let .updated(moment): moment
        case let .stale(_, updatedAt?): updatedAt
        default: .now
        }
    }
}
