import Foundation

/// Where the journal's lines live; a seam for the tests, which count reads and break writes.
protocol JournalStorage: Sendable {
    /// Adds one line at the end; never reads what is already there.
    func append(_ line: Data) throws
    /// Everything written so far; no file yet — nothing.
    func read() throws -> Data
    /// The whole file at once, for cutting it down to the runs kept.
    func replace(with data: Data) throws
}

/// The journal on disk: JSON Lines, one event a line, next to the queue's file — the command and the open app write
/// and read the same journal. Readable after the first unlock, as the queue: a payment on a locked phone writes too.
struct JournalFile: JournalStorage {
    /// The queue's: a journal closed while the queue is open would lose the very runs it is for.
    static let protection = CaptureFileStore.protection

    let fileURL: URL

    /// `Application Support/Kapelka/commands.jsonl`, in the folder of `captures.json`.
    static let inApplicationSupport = JournalFile(
        fileURL: URL.applicationSupportDirectory.appending(path: "Kapelka/commands.jsonl")
    )

    func append(_ line: Data) throws {
        guard FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)) else {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try line.write(to: fileURL, options: [.withoutOverwriting, Self.protection])
            return
        }
        let handle = try FileHandle(forWritingTo: fileURL)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: line)
    }

    func read() throws -> Data {
        do {
            return try Data(contentsOf: fileURL)
        } catch CocoaError.fileReadNoSuchFile {
            return Data()
        }
    }

    func replace(with data: Data) throws {
        try data.write(to: fileURL, options: [.atomic, Self.protection])
    }
}
