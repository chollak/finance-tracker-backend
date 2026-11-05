import SwiftUI

/// Settings → «Журнал команд» (#241): the runs of «Записать оплату», «Записать трату» and «Отправить очередь», newest
/// first — when, which command, each step with its time from the start, and how it ended. «Поделиться» sends it as
/// text through the system share sheet: to the chat, not to GitHub — a payment's merchant and amount are in it.
struct CommandJournalView: View {
    let load: @MainActor () async -> [JournalRun]

    @State private var page: JournalPage?
    /// At the top of the shared text: the app is rebuilt every week.
    @State private var build = AppBuild.current()

    var body: some View {
        List {
            if let page {
                if page.entries.isEmpty {
                    ContentUnavailableView(
                        "Команды ещё не запускались",
                        systemImage: "list.bullet.rectangle",
                        description: Text("Здесь появятся «Записать оплату», «Записать трату» и «Отправить очередь».")
                    )
                }
                ForEach(page.entries) { entry in
                    RunSection(run: entry.run, title: entry.title)
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Журнал команд")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let page, !page.entries.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: page.shared) {
                        Label("Поделиться", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        page = JournalPage(runs: await load(), calendar: .current, build: build)
    }
}

/// The journal as its screen shows it, made once per load (#284): the list redraws as it scrolls, and neither the text
/// of «Поделиться» for up to 450 runs nor their titles are built again for that.
struct JournalPage {
    struct Entry: Identifiable {
        let run: JournalRun
        /// «3 нояб., 08:05:12 · Записать оплату».
        let title: String

        var id: UUID { run.id }
    }

    let entries: [Entry]
    let shared: String

    init(runs: [JournalRun], calendar: Calendar, build: AppBuild) {
        let dates = JournalDates(calendar: calendar)
        entries = runs.map { Entry(run: $0, title: JournalText.title($0, dates: dates)) }
        shared = JournalText.shared(runs, dates: dates, build: build)
    }
}

/// One run: its start and command over its steps — each with its time from the start — then how it ended.
private struct RunSection: View {
    let run: JournalRun
    let title: String

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                if let launch = run.launch {
                    Text(JournalText.launch(launch))
                        .foregroundStyle(.secondary)
                }
                Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 12, verticalSpacing: 4) {
                    ForEach(Array(run.steps.enumerated()), id: \.offset) { _, step in
                        GridRow {
                            // One width for the usual times, so the steps of all runs start in one column
                            Text(JournalText.duration(ms: step.ms))
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                                .frame(minWidth: 52, alignment: .leading)
                                .accessibilityHidden(true)
                            // VoiceOver reads the step once, «время — текст», with short ids (#243): a cell of the
                            // grid speaks for its row, the time cell stays silent
                            Text(step.text)
                                .accessibilityLabel(JournalText.spoken(step))
                        }
                    }
                }
                Text(JournalText.outcome(run.outcome))
                    .fontWeight(.semibold)
                    .foregroundStyle(isTrouble ? Color.red : Color.primary)
                    .accessibilityLabel(JournalText.spoken(JournalText.outcome(run.outcome)))
            }
            .font(.footnote)
            .padding(.vertical, 4)
        } header: {
            Text(title)
                .textCase(nil)
        }
    }

    /// Ended with an error or «оборвана» — the app closed before the end: what the journal is for.
    private var isTrouble: Bool {
        switch run.outcome {
        case .failed, .interrupted: true
        case .going, .finished: false
        }
    }
}
