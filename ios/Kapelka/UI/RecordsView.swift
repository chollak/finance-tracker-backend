import SwiftUI

/// The tab «Записи» (FT-220): the server's records by day, standard iOS components only. Pull to refresh; the next
/// page comes as the list's end scrolls into view. A swipe deletes, with «Вернуть» on the bar at the bottom for 5 s;
/// a tap opens the sheet of categories (FT-221). FT-254: the line over the list says how fresh it is, each day's
/// header has its total, a tap on «Записал: …» scrolls to its record and lights it.
struct RecordsView: View {
    let list: RecordsList
    let openSettings: () -> Void

    /// The line over the list: where «вкладка сверху» scrolls to.
    private static let top = "records-top"

    var body: some View {
        @Bindable var list = list
        NavigationStack {
            ScrollViewReader { proxy in
                records
                    // `initial`: the tab may first appear with the scroll already asked for
                    .onChange(of: list.scroll, initial: true) {
                        scroll(proxy)
                    }
            }
            .overlay { placeholder }
            .safeAreaInset(edge: .bottom) {
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
            // VoiceOver hears each bar; «Вернуть» on its way is not news
            .onChange(of: list.notice?.id) {
                guard let notice = list.notice, notice.undo?.isRestoring != true else { return }
                AccessibilityNotification.Announcement(notice.text).post()
            }
            // The system's indicator alone: the line over the list stays as it was
            .refreshable { await list.refresh(pulled: true) }
            .sheet(item: $list.picker) { CategorySheet(picker: $0) }
            .navigationTitle("Записи")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SettingsButton(action: openSettings)
                }
            }
        }
    }

    private var records: some View {
        List {
            if list.screen == .list {
                if list.status != nil {
                    Section {
                        RecordsCaptionView(list: list)
                            .id(Self.top)
                    }
                }
                ForEach(list.days) { day in
                    Section(day.header) {
                        ForEach(day.rows) { row in
                            recordRow(row)
                                // The system's look of a tapped row, for a second
                                .listRowBackground(row.id == list.highlighted ? Color(uiColor: .systemGray4) : nil)
                        }
                    }
                }
                if list.hasMore {
                    nextPageSection
                }
            }
        }
        .animation(.easeOut(duration: 0.4), value: list.highlighted)
    }

    /// Once per request: to the record, or to the top when it is not on the loaded pages.
    private func scroll(_ proxy: ScrollViewProxy) {
        guard let scroll = list.scroll else { return }
        list.scrolled(scroll.number)
        withAnimation {
            switch scroll.target {
            case let .record(id):
                proxy.scrollTo(id, anchor: .center)
            case .top:
                proxy.scrollTo(Self.top, anchor: .top)
            }
        }
    }

    private func recordRow(_ row: RecordRow) -> some View {
        Button {
            list.openPicker(for: row.id)
        } label: {
            RecordRowView(row: row)
        }
        // «!» opens the same sheet, with why and «Да, верно» over the categories (FT-254)
        .accessibilityHint(row.needsReview ? "Почему «проверить» и сменить категорию" : "Сменить категорию")
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await list.delete(row.id) }
            } label: {
                Label("Удалить", systemImage: "trash")
            }
            // The screen's black-or-white tint would make it white on white in the dark theme
            .tint(.red)
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
                    // In a button: without its own style the title would take the tint
                    Text(row.title)
                        .foregroundStyle(.primary)
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
