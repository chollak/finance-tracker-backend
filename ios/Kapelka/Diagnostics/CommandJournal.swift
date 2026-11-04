import Foundation
import os

/// What «Записать оплату», «Записать трату» and «Отправить очередь» did, step by step (#241): why the Wallet
/// automation fails now and then. iOS leaves no trace when it stops a command; a run with a start and no end does.
///
/// A command only appends lines and never reads the file: it pays for a line, not for the journal. The file is read
/// when the app opens — once per process, to mark the runs an earlier process left without an end and cut it down to
/// the last 200 runs — and when the journal's screen shows it. Nothing here throws: a journal that cannot write loses
/// its lines, never the command. It stays on the phone; nothing sends it anywhere.
actor CommandJournal {
    static let keptRuns = 200

    private static let logger = Logger(subsystem: "kapelka", category: "journal")

    private let storage: any JournalStorage
    private let now: @Sendable () -> Date
    /// A monotonic reading: durations. The phone's clock may jump (time sync, by hand); the steps' times must not.
    private let uptime: @Sendable () -> Duration
    /// When the kernel started this process (`ProcessStart`); `nil` when it could not tell.
    private let processStart: Date?
    /// The runs of this process still going, by their start reading. Any other run without an end is from a process
    /// that is gone.
    private var going: [UUID: Duration] = [:]
    /// Neither a command nor the app's opening came before in this process: the next command starts it cold.
    private var isFresh = true
    /// The app's opening already marked and cut the file: later runs are this process's own.
    private var tidied = false
    private let encoder = JSONEncoder()

    init(
        storage: any JournalStorage,
        now: @escaping @Sendable () -> Date = { Date() },
        uptime: @escaping @Sendable () -> Duration,
        processStart: Date? = nil
    ) {
        self.storage = storage
        self.now = now
        self.uptime = uptime
        self.processStart = processStart
    }

    /// The journal of the app: `ContinuousClock`, which goes on while the phone sleeps — a command iOS froze and woke
    /// up later shows the whole wait, as iOS counted it; `SuspendingClock` would hide it.
    static func live() -> CommandJournal {
        let origin = ContinuousClock.now
        return CommandJournal(
            storage: JournalFile.inApplicationSupport,
            uptime: { origin.duration(to: .now) },
            processStart: ProcessStart.date()
        )
    }

    /// A new run with its own id: two commands at once (a payment during «Отправить очередь») never share one. Its
    /// start says whether the process was started for it and how long ago — a slow cold launch shows there.
    func begin(_ command: JournalCommand) -> UUID {
        let run = UUID()
        let at = now()
        going[run] = uptime()
        var line = JournalLine(run: run, event: .start, at: at, command: command)
        line.cold = isFresh
        line.sinceProcessStart = processStart.map { Self.ms(at.timeIntervalSince($0)) }
        isFresh = false
        append(line)
        return run
    }

    func step(_ run: UUID, _ text: String) {
        guard let start = going[run] else { return }
        append(JournalLine(run: run, event: .step, at: now(), text: text, ms: ms(since: start)))
    }

    /// The command's own task cancelled — iOS stopped `perform` and left the process alive — is a step before the end.
    func finish(_ run: UUID) {
        guard let start = going.removeValue(forKey: run) else { return }
        noteCancelled(run, since: start)
        append(JournalLine(run: run, event: .end, at: now(), ms: ms(since: start)))
    }

    func fail(_ run: UUID, _ message: String) {
        guard let start = going.removeValue(forKey: run) else { return }
        noteCancelled(run, since: start)
        append(JournalLine(run: run, event: .failed, at: now(), text: message, ms: ms(since: start)))
    }

    /// The app opened: once per process, the runs an earlier process left without an end are marked and the file is
    /// cut down to the last 200 runs — one read, never while a command waits for it at its start.
    func tidy() {
        isFresh = false
        guard !tidied, let lines = readLines() else { return }
        tidied = true
        let runs = JournalRun.fold(lines.map(\.line))
        let marks = runs.filter { $0.outcome == .going && going[$0.id] == nil }.map {
            JournalLine(run: $0.id, event: .interrupted, at: now(), text: $0.lastStep)
        }
        guard runs.count > Self.keptRuns else {
            for mark in marks {
                append(mark)
            }
            return
        }
        let kept = Set(runs.suffix(Self.keptRuns).map(\.id))
        let raw = lines.filter { kept.contains($0.line.run) }.map(\.raw)
            + marks.filter { kept.contains($0.run) }.compactMap(encoded)
        do {
            try storage.replace(with: Data(raw.map { "\n" + $0 }.joined().utf8))
        } catch {
            Self.logger.error("Journal not trimmed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Newest first. A run of another process without an end shows as «оборвана» whether its mark is in the file yet
    /// or not.
    func runs() -> [JournalRun] {
        guard let lines = readLines() else { return [] }
        return JournalRun.fold(lines.map(\.line)).reversed().map { run in
            guard run.outcome == .going, going[run.id] == nil else { return run }
            var interrupted = run
            interrupted.outcome = .interrupted(lastStep: run.lastStep)
            return interrupted
        }
    }

    private func noteCancelled(_ run: UUID, since start: Duration) {
        guard Task.isCancelled else { return }
        append(JournalLine(run: run, event: .step, at: now(), text: JournalText.cancelled, ms: ms(since: start)))
    }

    /// Lines that do not decode — one cut short, one from a newer build — and empty ones are skipped. `nil` when the
    /// file cannot be read: before the first unlock it is closed, and nothing is marked or cut then.
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

    /// Each line starts with a line break: a line the process was killed in the middle of writing is closed by the
    /// next one, not glued to it. The empty line in front of the first one is skipped on reading.
    private func append(_ line: JournalLine) {
        guard let text = encoded(line) else { return }
        do {
            try storage.append(Data(("\n" + text).utf8))
        } catch {
            Self.logger.error("Journal line lost: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func encoded(_ line: JournalLine) -> String? {
        do {
            return String(decoding: try encoder.encode(line), as: UTF8.self)
        } catch {
            Self.logger.error("Journal line not encoded: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func ms(since start: Duration) -> Int {
        let (seconds, attoseconds) = (uptime() - start).components
        return Int(seconds) * 1000 + Int(attoseconds / 1_000_000_000_000_000)
    }

    private static func ms(_ interval: TimeInterval) -> Int {
        Int((interval * 1000).rounded())
    }
}
