import Foundation
import os

/// What «Записать оплату», «Записать трату» and «Отправить очередь» did, step by step (#241): why the Wallet
/// automation fails now and then. iOS leaves no trace when it stops a command; a run with a start and no end does.
///
/// A command only appends lines: it pays for a line, not for the journal. The file is read when the app opens — once
/// per process, to mark the runs an earlier process left without an end and cut it down to the runs kept — and when
/// the journal's screen shows it. A command reads it only to cut a file grown over `trimAboveBytes`, at the end of its
/// run (#243): Wallet may pay day after day and never open the app. Nothing here throws: a journal that cannot write
/// loses its lines, never the command. It stays on the phone; nothing sends it anywhere.
actor CommandJournal {
    /// The file over this, as the end of a run leaves it, is cut by that command — once in hundreds of runs, one read.
    static let trimAboveBytes = 1 << 20
    /// What a cut leaves at most: half the trigger, so long runs never make every command cut again.
    static let keptBytes = 1 << 19

    /// How many of a command's newest runs a cut keeps — each command its own (#243): the «Wi-Fi дома» automation runs
    /// «Отправить очередь» many times a day and never pushes the payments out. It mostly finds nothing to send, so
    /// fewer of it.
    static func keptRuns(of command: JournalCommand) -> Int {
        switch command {
        case .recordPayment, .recordExpense: 200
        case .sendQueue: 50
        }
    }

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
        end(JournalLine(run: run, event: .end, at: now(), ms: ms(since: start)))
    }

    func fail(_ run: UUID, _ message: String) {
        guard let start = going.removeValue(forKey: run) else { return }
        noteCancelled(run, since: start)
        end(JournalLine(run: run, event: .failed, at: now(), text: message, ms: ms(since: start)))
    }

    /// The app opened: once per process, the runs an earlier process left without an end are marked and the file is
    /// cut down to the runs kept — one read, never while a command waits for it at its start.
    func tidy() {
        isFresh = false
        guard !tidied else { return }
        tidied = markAndTrim()
    }

    /// Newest first. A run of another process without an end shows as «оборвана» whether its mark is in the file yet
    /// or not.
    func runs() -> [JournalRun] {
        guard let lines = readFile()?.lines else { return [] }
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

    /// The run's last line. A file it leaves over `trimAboveBytes` is cut right away, once the run's own work is done.
    private func end(_ line: JournalLine) {
        guard let size = append(line), size > Self.trimAboveBytes else { return }
        markAndTrim()
    }

    /// One read: the runs an earlier process left without an end get their mark, and a file over its limits is cut
    /// down to the newest runs of each command (`keptRuns(of:)`), then to the newest lines within `keptBytes`. A run
    /// that loses its start to the bytes is skipped on reading and gone with the next cut. `false` when the file cannot
    /// be read.
    @discardableResult
    private func markAndTrim() -> Bool {
        guard let file = readFile() else { return false }
        let runs = JournalRun.fold(file.lines.map(\.line))
        let marks = runs.filter { $0.outcome == .going && going[$0.id] == nil }.map {
            JournalLine(run: $0.id, event: .interrupted, at: now(), text: $0.lastStep)
        }
        let kept = Self.kept(runs)
        guard kept.count < runs.count || file.size > Self.trimAboveBytes else {
            for mark in marks {
                append(mark)
            }
            return true
        }
        let raw = file.lines.filter { kept.contains($0.line.run) }.map(\.raw)
            + marks.filter { kept.contains($0.run) }.compactMap(encoded)
        do {
            try storage.replace(with: Data(Self.newest(raw, within: Self.keptBytes).map { "\n" + $0 }.joined().utf8))
        } catch {
            Self.logger.error("Journal not trimmed: \(error.localizedDescription, privacy: .public)")
        }
        return true
    }

    /// The newest runs of each command, up to its own limit.
    private static func kept(_ runs: [JournalRun]) -> Set<UUID> {
        Set(Dictionary(grouping: runs, by: \.command).flatMap { command, runs in
            runs.suffix(keptRuns(of: command)).map(\.id)
        })
    }

    /// The newest lines that fit in `bytes` as written, each after its line break.
    private static func newest(_ lines: [String], within bytes: Int) -> [String] {
        var total = 0
        var fitting: [String] = []
        for line in lines.reversed() {
            total += line.utf8.count + 1
            guard total <= bytes else { break }
            fitting.append(line)
        }
        return fitting.reversed()
    }

    /// Lines that do not decode — one cut short, one from a newer build — and empty ones are skipped; `size` is the
    /// file's, in bytes. `nil` when the file cannot be read: before the first unlock it is closed, and nothing is
    /// marked or cut then.
    private func readFile() -> (lines: [(raw: String, line: JournalLine)], size: Int)? {
        let data: Data
        do {
            data = try storage.read()
        } catch {
            Self.logger.error("Journal not read: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        let decoder = JSONDecoder()
        let lines = String(decoding: data, as: UTF8.self).split(separator: "\n").compactMap { raw in
            (try? decoder.decode(JournalLine.self, from: Data(raw.utf8))).map { (raw: String(raw), line: $0) }
        }
        return (lines, data.count)
    }

    /// Each line starts with a line break: a line the process was killed in the middle of writing is closed by the
    /// next one, not glued to it. The empty line in front of the first one is skipped on reading. The file's size
    /// after it; `nil` when it was not written.
    @discardableResult
    private func append(_ line: JournalLine) -> Int? {
        guard let text = encoded(line) else { return nil }
        do {
            return try storage.append(Data(("\n" + text).utf8))
        } catch {
            Self.logger.error("Journal line lost: \(error.localizedDescription, privacy: .public)")
            return nil
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
