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
}

/// The queue on disk: one JSON file, replaced atomically on every change, readable after the first unlock — so the
/// background refresh can send while the phone is locked.
struct CaptureFileStore: Sendable {
    private static let logger = Logger(subsystem: "kapelka", category: "queue-file")

    let fileURL: URL

    /// `Application Support/Kapelka/captures.json`: kept across app updates and reinstalls over the old build.
    static func inApplicationSupport() throws -> CaptureFileStore {
        let folder = try FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appending(path: "Kapelka", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return CaptureFileStore(fileURL: folder.appending(path: "captures.json"))
    }

    /// No file yet — an empty queue. A file that cannot be read is moved aside, not overwritten: whatever is in it
    /// can still be recovered by hand.
    func load() -> QueueState {
        guard let data = try? Data(contentsOf: fileURL) else { return QueueState() }
        do {
            return try JSONDecoder().decode(QueueState.self, from: data)
        } catch {
            setAside()
            return QueueState()
        }
    }

    func save(_ state: QueueState) throws {
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
