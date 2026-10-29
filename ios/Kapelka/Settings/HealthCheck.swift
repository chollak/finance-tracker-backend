import Foundation

enum HealthStatus: Equatable, Sendable {
    case available
    /// The server answered, but not 200: `/api/health` is 503 when the bot's polling failed for good (FT-154).
    case answered(Int)
    case unreachable
}

/// «Проверить связь»: `GET /api/health`, no token — it only tells whether the PC answers. A wrong token shows up on
/// the first record as «проверь токен».
struct HealthCheck: Sendable {
    static let timeout: TimeInterval = 10

    let transport: any HTTPTransport

    func run(base: URL) async -> HealthStatus {
        var request = URLRequest(url: base.appending(path: "api/health"))
        request.httpMethod = "GET"
        request.timeoutInterval = Self.timeout
        do {
            let (_, response) = try await transport.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .unreachable }
            return http.statusCode == 200 ? .available : .answered(http.statusCode)
        } catch {
            return .unreachable
        }
    }
}
