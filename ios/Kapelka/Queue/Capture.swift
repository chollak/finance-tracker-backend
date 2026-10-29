import Foundation

/// One phrase typed on the phone. It is on disk before the first attempt to send it and leaves the pending ones only
/// when the server answered (FT-161, «Как устроено»).
struct Capture: Codable, Equatable, Identifiable, Sendable {
    enum State: String, Codable, Sendable {
        /// Waits on the phone.
        case pending
        /// The server took it (2xx); `reply` is what it said.
        case sent
        /// The server refused the record itself (400); never sent again.
        case rejected
    }

    /// `clientId` of `POST /api/quick-capture`: a repeat with it writes nothing new (FT-106).
    let clientId: UUID
    let text: String
    /// The moment of input; the server counts «сегодня» and «вчера» from it (FT-175).
    let capturedAt: Date
    /// The phone's time zone at input, so `capturedAt` goes out with the offset the person had then.
    let timeZoneIdentifier: String
    var state: State = .pending
    var attempts = 0
    var reply: CaptureReply?
    var rejection: String?

    var id: UUID { clientId }
}

/// The server's `data.status` and `data.ack` for a sent record.
struct CaptureReply: Codable, Equatable, Sendable {
    let status: String
    let title: String
    let summary: String
}

enum CaptureTextError: Error, Equatable {
    case empty
    case tooLong
}

enum CaptureText {
    /// The server's limit on `text` (`docs/QUICK_CAPTURE_API.md`).
    static let maxLength = 2000

    static func validated(_ raw: String) throws(CaptureTextError) -> String {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw .empty }
        guard text.count <= maxLength else { throw .tooLong }
        return text
    }
}
