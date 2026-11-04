import Foundation
@testable import Kapelka

/// The monotonic clock of the journal, moved by hand: durations without waiting for them.
final class TestUptime: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Duration = .seconds(1000)

    var now: Duration { lock.withLock { current } }

    func advance(by duration: Duration) {
        lock.withLock { current += duration }
    }
}

/// The journal file as the journal uses it, counting what it reads and rewrites.
final class CountingStorage: JournalStorage, @unchecked Sendable {
    private let lock = NSLock()
    private let file: JournalFile
    private var counts = (reads: 0, appends: 0, replaces: 0)

    init(_ file: JournalFile) {
        self.file = file
    }

    var reads: Int { lock.withLock { counts.reads } }
    var appends: Int { lock.withLock { counts.appends } }
    var replaces: Int { lock.withLock { counts.replaces } }

    func append(_ line: Data) throws {
        lock.withLock { counts.appends += 1 }
        try file.append(line)
    }

    func read() throws -> Data {
        lock.withLock { counts.reads += 1 }
        return try file.read()
    }

    func replace(with data: Data) throws {
        lock.withLock { counts.replaces += 1 }
        try file.replace(with: data)
    }
}

/// A journal whose every read and write fails: a full disk, a broken file.
struct BrokenStorage: JournalStorage {
    struct Broken: Error {}

    func append(_ line: Data) throws { throw Broken() }
    func read() throws -> Data { throw Broken() }
    func replace(with data: Data) throws { throw Broken() }
}

/// One journal file in its own temporary folder. `makeJournal()` again over the same file is the next process: the app
/// killed by iOS and started anew.
final class JournalHarness: Sendable {
    let file: JournalFile
    let clock: TestClock
    let uptime = TestUptime()

    init(clock: TestClock = TestClock()) throws {
        file = JournalFile(fileURL: try TestFolders.make().appending(path: "commands.jsonl"))
        self.clock = clock
    }

    deinit {
        try? FileManager.default.removeItem(at: file.fileURL.deletingLastPathComponent())
    }

    func makeJournal(storage: (any JournalStorage)? = nil) -> CommandJournal {
        let clock = clock
        let uptime = uptime
        return CommandJournal(storage: storage ?? file, now: { clock.now }, uptime: { uptime.now })
    }

    /// The file's lines as written.
    func lines() throws -> [String] {
        String(decoding: try file.read(), as: UTF8.self).split(separator: "\n").map(String.init)
    }
}

extension JournalRun {
    /// The steps' texts, without their times.
    var texts: [String] { steps.map(\.text) }
}

extension CommandJournal {
    /// A journal the test does not read, in this run's temporary folder.
    static func scratch() -> CommandJournal {
        let folder = (try? TestFolders.make()) ?? FileManager.default.temporaryDirectory
        return CommandJournal(storage: JournalFile(fileURL: folder.appending(path: "commands.jsonl")), uptime: { .zero })
    }
}
