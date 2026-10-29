import Foundation

/// The one network call the queue and the health check need; tests replace it with a scripted server.
protocol HTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

struct URLSessionTransport: HTTPTransport {
    /// Ephemeral: no cookies, no cache. Fails at once without a connection instead of waiting for one — the queue
    /// keeps the record and tries again on the next trigger.
    static let shared = URLSessionTransport(session: URLSession(configuration: {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return configuration
    }()))

    let session: URLSession

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await session.data(for: request)
    }
}
