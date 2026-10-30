import Foundation

/// The one network call the queue and the health check need; tests replace it with a scripted server.
protocol HTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

struct URLSessionTransport: HTTPTransport {
    /// Ephemeral: no cookies, no cache. Fails at once without a connection instead of waiting for one — the queue
    /// keeps the record and tries again on the next trigger. Redirects are refused (see `RefuseRedirects`).
    static let shared = URLSessionTransport(session: URLSession(
        configuration: {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.waitsForConnectivity = false
            configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
            return configuration
        }(),
        delegate: RefuseRedirects(),
        delegateQueue: nil
    ))

    let session: URLSession

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await session.data(for: request)
    }
}

/// A redirected POST arrives as a GET, and the token header could follow it to another host. The 3xx itself comes back
/// as the answer, and the queue waits for the next try.
private final class RefuseRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest
    ) async -> URLRequest? {
        nil
    }
}
