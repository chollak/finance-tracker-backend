import Foundation
import os

/// What «Записать оплату», «Записать трату» and «Отправить очередь» did, step by step (#241): why the Wallet
/// automation fails now and then. iOS leaves no trace when it stops a command; a run with a start and no end does.
///
/// Every call appends one line and never reads the file: a command pays for a line, not for the journal. The file is
/// read once per process — at the first command or when the app opens — to mark the runs an earlier process left
/// without an end, and cut down to the last 200 runs only when the app opens. Nothing here throws: a journal that
/// cannot write loses its lines, never the command. It stays on the phone; nothing sends it anywhere.
actor CommandJournal {
    static let keptRuns = 200

    private static let logger = Logger(subsystem: "kapelka", category: "journal")

    private let storage: any JournalStorage
    private let now: @Sendable () -> Date
    /// A monotonic reading: durations. The phone's clock may jump (time sync, by hand); the steps' times must not.
    private let uptime: @Sendable () -> Duration
    /// The runs of this process still going, by their start reading. Any other run without an end is from a process
    /// that is gone.
    private var going: [UUID: Duration] = [:]
    /// The file was read for runs left without an end: once per process is enough, later ones are this process's.
    private var swept = false
    private let encoder = JSONEncoder()

    init(
        storage: any JournalStorage,
        now: @escaping @Sendable () -> Date = { Date() },
        uptime: @escaping @Sendable () -> Duration
    ) {
        self.storage = storage
        self.now = now
        self.uptime = uptime
    }

    /// The journal of the app: `ContinuousClock`, which goes on while the phone sleeps — a command iOS froze and woke
    /// up later shows the whole wait, as iOS counted it; `SuspendingClock` would hide it.
    static func live() -> CommandJournal {
        let origin = ContinuousClock.now
        return CommandJournal(storage: JournalFile.inApplicationSupport, uptime: { origin.duration(to: .now) })
    }

    /// A new run with its own id: two commands at once (a payment during «Отправить очередь») never share one.
    func begin(_ command: JournalCommand) -> UUID {
        if !swept {
            markInterrupted()
        }
        let run = UUID()
        going[run] = uptime()
        append(JournalLine(run: run, event: .start, at: now(), command: command))
        return run
    }

    func step(_ run: UUID, _ text: String) {
        guard let start = going[run] else { return }
        append(JournalLine(run: run, event: .step, at: now(), text: text, ms: ms(since: start)))
    }

    func finish(_ run: UUID) {
        guard let start = going.removeValue(forKey: run) else { return }
        append(JournalLine(run: run, event: .end, at: now(), ms: ms(since: start)))
    }

    func fail(_ run: UUID, _ message: String) {
        guard let start = going.removeValue(forKey: run) else { return }
        append(JournalLine(run: run, event: .failed, at: now(), text: message, ms: ms(since: start)))
    }

    /// The app opened: runs left without an end are marked, the file cut down to the last 200 runs.
    func tidy() {
        markInterrupted()
        trim()
    }

    /// Newest first. A run of another process still without its mark shows as «оборвана» all the same.
    func runs() -> [JournalRun] {
        guard let lines = readLines() else { return [] }
        return JournalRun.fold(lines.map(\.line)).reversed().map { run in
            guard run.outcome == .going, going[run.id] == nil else { return run }
            var interrupted = run
            interrupted.outcome = .interrupted(lastStep: run.lastStep)
            return interrupted
        }
    }

    private func markInterrupted() {
        guard let lines = readLines() else { return }
        swept = true
        for run in JournalRun.fold(lines.map(\.line)) where run.outcome == .going && going[run.id] == nil {
            append(JournalLine(run: run.id, event: .interrupted, at: now(), text: run.lastStep))
        }
    }

    private func trim() {
        guard let lines = readLines() else { return }
        let runs = JournalRun.fold(lines.map(\.line))
        guard runs.count > Self.keptRuns else { return }
        let kept = Set(runs.suffix(Self.keptRuns).map(\.id))
        let text = lines.filter { kept.contains($0.line.run) }.map { $0.raw + "\n" }.joined()
        do {
            try storage.replace(with: Data(text.utf8))
        } catch {
            Self.logger.error("Journal not trimmed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Lines that do not decode — one cut short, one from a newer build — are skipped. `nil` when the file cannot be
    /// read: before the first unlock it is closed, and nothing is marked or cut then.
    private func readLines() -> [(raw: String, line: JournalLine)]? {
        let data: Data
        do {
            data = try storage.read()
        } catch {
            Self.logger.error("Journal not read: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        let decoder = JSONDecoder()
        return String(decoding: data, as: UTF8.self).split(separator: "\n").compactMap { raw in
            guard let line = try? decoder.decode(JournalLine.self, from: Data(raw.utf8)) else { return nil }
            return (String(raw), line)
        }
    }

    private func append(_ line: JournalLine) {
        do {
            var data = try encoder.encode(line)
            data.append(UInt8(ascii: "\n"))
            try storage.append(data)
        } catch {
            Self.logger.error("Journal line lost: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func ms(since start: Duration) -> Int {
        let (seconds, attoseconds) = (uptime() - start).components
        return Int(seconds) * 1000 + Int(attoseconds / 1_000_000_000_000_000)
    }
}
