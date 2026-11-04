import Foundation

/// The three App Shortcuts the journal follows (#241).
enum JournalCommand: String, Codable, Sendable {
    case recordPayment
    case recordExpense
    case sendQueue

    var title: String {
        switch self {
        case .recordPayment: "Записать оплату"
        case .recordExpense: "Записать трату"
        case .sendQueue: "Отправить очередь"
        }
    }
}

/// One line of the journal file. A run is its lines with the same `run`: the start, the steps, then an end, an error
/// or — found by the next process — «оборвана iOS».
struct JournalLine: Codable, Equatable, Sendable {
    enum Event: String, Codable, Sendable {
        case start
        case step
        case end
        case failed
        /// A later process found the run without an end: iOS stopped the command or the app. `text` is the last step.
        case interrupted
    }

    let run: UUID
    let event: Event
    /// The phone's clock, for the time on the screen.
    let at: Date
    var command: JournalCommand?
    var text: String?
    /// Since the run's start, on the monotonic clock (`CommandJournal`).
    var ms: Int?
    /// The start: nothing came before it in the process — no command, no opening of the app.
    var cold: Bool?
    /// The start: since the kernel started the process, in ms on the phone's clock.
    var sinceProcessStart: Int?
}

/// How the process stood when a command started: whether it was started for it and how long ago.
struct JournalLaunch: Equatable, Sendable {
    let cold: Bool
    /// `nil` when the process's start could not be told.
    let sinceProcessStartMs: Int?
}

/// One run as the screen shows it.
struct JournalRun: Equatable, Identifiable, Sendable {
    struct Step: Equatable, Sendable {
        /// Since the start.
        let ms: Int
        let text: String
    }

    enum Outcome: Equatable, Sendable {
        /// Still going in this process.
        case going
        case finished(ms: Int)
        case failed(ms: Int, message: String)
        /// Started, never ended: the process was gone before the end.
        case interrupted(lastStep: String)
    }

    static let startText = "начало"

    let id: UUID
    let command: JournalCommand
    let startedAt: Date
    var steps: [Step]
    var outcome: Outcome
    /// `nil` in a file written before it was kept.
    var launch: JournalLaunch?

    var lastStep: String {
        steps.last?.text ?? Self.startText
    }

    /// The runs in the order they started; lines of a run whose start is gone (cut off) are skipped.
    static func fold(_ lines: [JournalLine]) -> [JournalRun] {
        var order: [UUID] = []
        var runs: [UUID: JournalRun] = [:]
        for line in lines {
            if line.event == .start {
                guard let command = line.command, runs[line.run] == nil else { continue }
                order.append(line.run)
                runs[line.run] = JournalRun(
                    id: line.run,
                    command: command,
                    startedAt: line.at,
                    steps: [Step(ms: 0, text: startText)],
                    outcome: .going,
                    launch: line.cold.map { JournalLaunch(cold: $0, sinceProcessStartMs: line.sinceProcessStart) }
                )
                continue
            }
            guard var run = runs[line.run] else { continue }
            run.apply(line)
            runs[line.run] = run
        }
        return order.compactMap { runs[$0] }
    }

    private mutating func apply(_ line: JournalLine) {
        let ms = line.ms ?? 0
        switch line.event {
        case .start:
            break
        case .step:
            steps.append(Step(ms: ms, text: line.text ?? ""))
        case .end:
            outcome = .finished(ms: ms)
        case .failed:
            outcome = .failed(ms: ms, message: line.text ?? "")
        case .interrupted:
            outcome = .interrupted(lastStep: line.text ?? lastStep)
        }
    }
}
