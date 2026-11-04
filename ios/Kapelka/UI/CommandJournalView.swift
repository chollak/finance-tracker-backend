import SwiftUI

/// Settings → «Журнал команд» (#241): the runs of «Записать оплату», «Записать трату» and «Отправить очередь», newest
/// first — when, which command, each step with its time from the start, and how it ended. «Поделиться» sends it as
/// text through the system share sheet: to the chat, not to GitHub — a payment's merchant and amount are in it.
struct CommandJournalView: View {
    let load: @MainActor () async -> [JournalRun]

    @State private var runs: [JournalRun]?
    /// At the top of the shared text: the app is rebuilt every week.
    @State private var build = AppBuild.current()

    var body: some View {
        List {
            if let runs {
                if runs.isEmpty {
                    ContentUnavailableView(
                        "Команды ещё не запускались",
                        systemImage: "list.bullet.rectangle",
                        description: Text("Здесь появятся «Записать оплату», «Записать трату» и «Отправить очередь».")
                    )
                }
                ForEach(runs) { run in
                    RunSection(run: run)
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Журнал команд")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let runs, !runs.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: JournalText.shared(runs, calendar: .current, build: build)) {
                        Label("Поделиться", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
        .task { runs = await load() }
        .refreshable { runs = await load() }
    }
}

/// One run: its start and command over its steps — each with its time from the start — then how it ended.
private struct RunSection: View {
    let run: JournalRun

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
            Text(JournalText.title(run, calendar: .current))
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
