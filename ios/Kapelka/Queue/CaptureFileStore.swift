import Foundation
import os

/// Everything the queue keeps between launches.
struct QueueState: Codable, Equatable, Sendable {
    /// Oldest first: pending ones go out in this order.
    var captures: [Capture] = []
    /// The server refused the token (401, 403): nothing goes out until the settings change.
    var tokenRefused = false
    /// After 429: no attempt before this moment (`Retry-After`).
    var notBefore: Date?
    /// The record whose request is out now: shown as «Отправляю» and not deleted. Not kept on disk.
    var sendingId: UUID?

    private enum CodingKeys: String, CodingKey {
        case captures
        case tokenRefused
        case notBefore
    }

    init() {}

    // A file from an older build lacks the keys added since: they take their defaults instead of failing the file
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        captures = try container.decodeIfPresent([Capture].self, forKey: .captures) ?? []
        tokenRefused = try container.decodeIfPresent(Bool.self, forKey: .tokenRefused) ?? false
        notBefore = try container.decodeIfPresent(Date.self, forKey: .notBefore)
    }
}

enum QueueError: Error, Equatable, LocalizedError {
    /// The queue file cannot be opened yet (before the first unlock after a restart).
    case unavailable

    var errorDescription: String? {
        "очередь на телефоне пока закрыта — разблокируй телефон и попробуй ещё раз"
    }
}

/// The queue on disk: one JSON file, replaced atomically on every change, readable after the first unlock — so the
/// background refresh can send while the phone is locked.
struct CaptureFileStore: Sendable {
    private static let logger = Logger(subsystem: "kapelka", category: "queue-file")

    let fileURL: URL

    /// `Application Support/Kapelka/captures.json`: kept across app updates and reinstalls over the old build. The
    /// one place: a second file somewhere else would hide its records from the next launch.
    static let inApplicationSupport = CaptureFileStore(
        fileURL: URL.applicationSupportDirectory.appending(path: "Kapelka/captures.json")
    )

    /// No file yet — an empty queue. A file that does not decode is moved aside, not overwritten: whatever is in it
    /// can still be recovered by hand. A file that cannot be opened — before the first unlock after a restart — throws:
    /// it is not empty, and the queue must not write over it.
    func load() throws -> QueueState {
        let data: Data
        do {
            data = try Data(contentsOf: fileURL)
        } catch CocoaError.fileReadNoSuchFile {
            return QueueState()
        }
        do {
            return try JSONDecoder().decode(QueueState.self, from: data)
        } catch {
            setAside()
            return QueueState()
        }
    }

    /// Makes the folder on the first save; if that fails the record is refused, never written elsewhere.
    func save(_ state: QueueState) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(state).write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func setAside() {
        let stamp = Int(Date().timeIntervalSince1970)
        let aside = fileURL.deletingLastPathComponent().appending(path: "captures.unreadable-\(stamp).json")
        do {
            try FileManager.default.moveItem(at: fileURL, to: aside)
            Self.logger.error("Queue file unreadable, moved to \(aside.lastPathComponent, privacy: .public)")
        } catch {
            Self.logger.error("Queue file unreadable and not moved: \(error.localizedDescription, privacy: .public)")
        }
    }
}
