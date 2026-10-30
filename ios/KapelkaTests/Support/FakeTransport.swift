import Foundation
import Testing
@testable import Kapelka

/// The server on the other end of the tailnet, played back from a script. Every request is recorded; once the script
/// runs out, the server answers «Записал».
actor FakeTransport: HTTPTransport {
    enum Reply: Sendable, CustomTestStringConvertible {
        case http(Int, body: String = ServerReply.saved(), headers: [String: String] = [:])
        case failure(URLError.Code)

        var testDescription: String {
            switch self {
            case let .http(status, _, _): "HTTP \(status)"
            case let .failure(code): "URLError \(code.rawValue)"
            }
        }
    }

    struct SentBody: Decodable, Equatable {
        let text: String
        let clientId: String
        let capturedAt: String
    }

    private var replies: [Reply]
    private(set) var requests: [URLRequest] = []
    /// The most requests that were waiting for an answer at once.
    private(set) var maxInFlight = 0
    private var inFlight = 0
    private let latency: Duration

    init(_ replies: [Reply] = [], latency: Duration = .zero) {
        self.replies = replies
        self.latency = latency
    }

    func script(_ next: [Reply]) {
        replies.append(contentsOf: next)
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        requests.append(request)
        let reply = replies.isEmpty ? .http(200) : replies.removeFirst()
        inFlight += 1
        maxInFlight = max(maxInFlight, inFlight)
        defer { inFlight -= 1 }
        if latency > .zero {
            try await Task.sleep(for: latency)
        }
        switch reply {
        case let .http(status, body, headers):
            let url = try #require(request.url)
            let response = try #require(
                HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)
            )
            return (Data(body.utf8), response)
        case let .failure(code):
            throw URLError(code)
        }
    }

    func bodies() throws -> [SentBody] {
        try requests.map { request in
            try JSONDecoder().decode(SentBody.self, from: try #require(request.httpBody))
        }
    }

    func sentClientIds() throws -> [String] {
        try bodies().map(\.clientId)
    }
}

/// Bodies the real server sends (`docs/QUICK_CAPTURE_API.md`).
enum ServerReply {
    static func saved(
        status: String = "saved",
        title: String = "Записал",
        summary: String = "Кофе · 25 000 сум"
    ) -> String {
        """
        {"success":true,"data":{"status":"\(status)","text":"кофе 25к","transactions":[],"debts":[],\
        "ack":{"title":"\(title)","summary":"\(summary)","details":"Сегодня","actions":["edit","delete"]},\
        "review":{"reasons":[]}},"message":"Quick capture processed","timestamp":"2026-10-29T10:00:00.000Z"}
        """
    }

    static let textTooLong = """
        {"success":false,"error":{"code":"VALIDATION_ERROR",\
        "message":"Text is too long (maximum 2000 characters)","timestamp":"2026-10-29T10:00:00.000Z"}}
        """

    static let invalidToken = """
        {"success":false,"error":"Invalid shortcut capture token","code":"INVALID_SHORTCUT_TOKEN"}
        """

    static let rateLimited = """
        {"success":false,"error":"Too many AI requests, please try again later","code":"AI_RATE_LIMIT_EXCEEDED"}
        """
}
