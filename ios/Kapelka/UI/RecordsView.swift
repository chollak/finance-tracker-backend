import SwiftUI

/// The tab «Записи» (FT-220): the server's records by day, standard iOS components only. Pull to refresh; the next
/// page comes as the list's end scrolls into view. Each row is a row of a `List`, ready for swipe actions (FT-221).
struct RecordsView: View {
    let list: RecordsList
    let openSettings: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if list.screen == .list {
                    if let caption = list.caption {
                        Section {
                            Text(caption)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    ForEach(list.days) { day in
                        Section(day.title) {
                            ForEach(day.rows) { row in
                                RecordRowView(row: row)
                            }
                        }
                    }
                    if list.hasMore {
                        nextPageSection
                    }
                }
            }
            .overlay { placeholder }
            .refreshable { await list.refresh() }
            .navigationTitle("Записи")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SettingsButton(action: openSettings)
                }
            }
        }
    }

    /// The list's end: it asks for the next page once on screen — again for each `nextPageKey`, since the row is new.
    private var nextPageSection: some View {
        Section {
            if let problem = list.moreProblem {
                Button("Загрузить ещё") {
                    Task { await list.loadMore() }
                }
                Text(problem.message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .id(list.nextPageKey)
                    // Not `.task`: scrolling past the end would cancel the request and show «Нет связи»
                    .onAppear {
                        Task { await list.loadMore() }
                    }
            }
        }
    }

    @ViewBuilder
    private var placeholder: some View {
        switch list.screen {
        case .list:
            EmptyView()
        case .loading:
            ProgressView()
        case .empty:
            ContentUnavailableView(
                "Записей пока нет",
                systemImage: "tray",
                description: Text("Скажи или напиши трату во вкладке «Записать»")
            )
        case .notConfigured:
            ContentUnavailableView {
                Label("Нет адреса и токена", systemImage: "gearshape")
            } description: {
                Text("Укажи их в настройках — и здесь появятся записи")
            } actions: {
                // Not `.borderedProminent`: with the black-or-white tint it is white on white in the dark theme
                Button("Настройки", action: openSettings)
                    .buttonStyle(.bordered)
            }
        case .tokenRefused:
            ContentUnavailableView {
                Label("Сервер не принял токен", systemImage: "key")
            } description: {
                Text("Проверь токен в настройках")
            } actions: {
                Button("Настройки", action: openSettings)
                    .buttonStyle(.bordered)
            }
        case .unreachable:
            ContentUnavailableView {
                Label("Нет связи", systemImage: "wifi.slash")
            } description: {
                Text("Записи появятся, когда сервер ответит")
            } actions: {
                Button("Повторить") {
                    Task { await list.refresh() }
                }
                .buttonStyle(.bordered)
            }
        }
    }
}

/// How a row of «Записи» lays out at a text size.
enum RecordRowLayout {
    /// At the accessibility sizes the amount goes under the title: side by side the title shrank to «С…» and a long
    /// one to a lone «…» (FT-220 review).
    static func stacks(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }
}

/// The note or the merchant, «категория · счёт» under it, the amount with its sign; «проверить» as a mark.
private struct RecordRowView: View {
    let row: RecordRow

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let stacked = RecordRowLayout.stacks(at: typeSize)
        let layout = stacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
        layout {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(row.title)
                        .lineLimit(2)
                    if row.needsReview {
                        Image(systemName: "exclamationmark.circle")
                            .foregroundStyle(.orange)
                            .accessibilityLabel("Проверить")
                    }
                }
                if !row.details.isEmpty {
                    // Two lines: at the largest sizes before the accessibility ones the account's name was cut off
                    Text(row.details)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            if !stacked {
                Spacer(minLength: 8)
            }
            Text(row.amount)
                .monospacedDigit()
                .foregroundStyle(row.isIncome ? Color.green : Color.primary)
                .lineLimit(1)
                // Digit groups hold together with non-breaking spaces: under the title it shrinks rather than cuts
                .minimumScaleFactor(stacked ? 0.7 : 1)
                .layoutPriority(1)
        }
        .accessibilityElement(children: .combine)
    }
}
