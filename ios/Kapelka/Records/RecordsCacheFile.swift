import Foundation

/// The first page as the server last gave it, and when: the list without a network — «Нет связи · обновлено в 14:32».
struct RecordsSnapshot: Codable, Equatable, Sendable {
    /// The server it came from: a page of another address is not shown.
    let address: String
    let page: RecordsPage
    let updatedAt: Date
}

/// `Application Support/Kapelka/records.json`, next to the queue. Only a copy of what the server has: a file that
/// does not read is simply not there, and the next answer writes it anew. Edits never wait in it (decision
/// 2026-10-31). Readable after the first unlock, like the queue.
struct RecordsCacheFile: Sendable {
    let fileURL: URL

    static let inApplicationSupport = RecordsCacheFile(
        fileURL: URL.applicationSupportDirectory.appending(path: "Kapelka/records.json")
    )

    func load() -> RecordsSnapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(RecordsSnapshot.self, from: data)
    }

    func save(_ snapshot: RecordsSnapshot) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(snapshot).write(
            to: fileURL,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
    }
}
