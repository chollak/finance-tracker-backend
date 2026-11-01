import Foundation

/// Why the last attempt ended «позже» (FT-252): the card on «Записать» says «Нет связи», «Сервер не ответил» or «Сервер
/// просит подождать». Kept in the queue's file, so the card says the same after a restart.
enum QueueWait: String, Codable, Equatable, Sendable {
    /// No network on the phone: no Wi-Fi or mobile data, or Tailscale off — the PC's name does not resolve. A new
    /// network path sends the queue again (`AutoSender`).
    case offline
    /// The server did not answer in time or answered with an error: the PC asleep, the server down, a proxy's page.
    case noAnswer
    /// 429: the server asks to wait until `QueueState.notBefore`.
    case busy

    /// A request that got no answer at all.
    static func of(_ error: any Error) -> QueueWait {
        guard let code = (error as? URLError)?.code else { return .noAnswer }
        return offlineCodes.contains(code) ? .offline : .noAnswer
    }

    private static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet,
        .networkConnectionLost,
        .dataNotAllowed,
        .internationalRoamingOff,
        .cannotFindHost,
        .dnsLookupFailed,
    ]
}
