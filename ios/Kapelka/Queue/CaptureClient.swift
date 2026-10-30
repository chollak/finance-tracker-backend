import Foundation
import os

/// Where to send and with what: the address of the PC in the tailnet and `SHORTCUT_CAPTURE_TOKEN`.
struct ServerConfiguration: Equatable, Sendable {
    let baseURL: URL
    let token: String
}

/// What one attempt to send a record ended with.
enum SendOutcome: Equatable, Sendable {
    case sent(CaptureReply)
    /// No network, timeout, 5xx, 429 and anything unexpected: the record waits. `after` — the server's `Retry-After`.
    case retryLater(after: TimeInterval?)
    /// 401, 403: the token or the owner is wrong; nothing goes out until the settings change.
    case tokenRefused
    /// 400: the server refused this record; it is not sent again.
    case rejected(String)
    /// No address or token yet.
    case notConfigured
}

protocol CaptureSending: Sendable {
    func send(_ capture: Capture) async -> SendOutcome
}

/// `POST /api/quick-capture` for a phrase and `POST /api/quick-capture/payment` for a payment, with the Shortcut token
/// (`docs/QUICK_CAPTURE_API.md`).
struct CaptureClient: CaptureSending {
    /// The server parses with OpenAI: up to 20 s and one retry (FT-145), so a short timeout would only cause repeats.
    static let timeout: TimeInterval = 60
    /// 429 without `Retry-After`.
    static let defaultRetryAfter: TimeInterval = 60
    /// A `Retry-After` longer than this would freeze the queue; the AI limit's window is 15 minutes.
    static let maxRetryAfter: TimeInterval = 3600

    private static let logger = Logger(subsystem: "kapelka", category: "capture-client")

    let configuration: @Sendable () -> ServerConfiguration?
    let transport: any HTTPTransport
    /// The Kapelka account the settings map a Wallet card to, read when the payment is sent (FT-179).
    var accountName: @Sendable (String) -> String? = { _ in nil }

    func send(_ capture: Capture) async -> SendOutcome {
        guard let configuration = configuration() else { return .notConfigured }
        let request: URLRequest
        do {
            let account = capture.payment?.card.flatMap(accountName)
            request = try Self.request(for: capture, to: configuration, accountName: account)
        } catch {
            // A payment without an amount is refused when queued and never pending; this only keeps it from looping
            return .rejected("Kapelka не может отправить эту запись — запиши её в Mini App")
        }
        let outcome: SendOutcome
        do {
            let (data, response) = try await transport.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .retryLater(after: nil) }
            outcome = Self.outcome(
                status: http.statusCode,
                retryAfter: http.value(forHTTPHeaderField: "Retry-After"),
                body: data
            )
            Self.logger.info(
                "Capture \(capture.clientId, privacy: .public): HTTP \(http.statusCode, privacy: .public)"
            )
        } catch {
            Self.logger.info(
                "Capture \(capture.clientId, privacy: .public): no answer, \(error.localizedDescription, privacy: .public)"
            )
            outcome = .retryLater(after: nil)
        }
        return outcome
    }

    static func request(
        for capture: Capture,
        to configuration: ServerConfiguration,
        accountName: String? = nil
    ) throws -> URLRequest {
        let path = capture.payment == nil ? "api/quick-capture" : "api/quick-capture/payment"
        var request = URLRequest(url: configuration.baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(configuration.token, forHTTPHeaderField: "X-Shortcut-Capture-Token")
        if let payment = capture.payment {
            request.httpBody = try JSONEncoder().encode(try PaymentBody(capture, payment, accountName: accountName))
        } else {
            request.httpBody = try JSONEncoder().encode(RequestBody(capture))
        }
        return request
    }

    static func outcome(status: Int, retryAfter: String?, body: Data) -> SendOutcome {
        switch status {
        case 200..<300:
            guard let reply = try? JSONDecoder().decode(SuccessBody.self, from: body), reply.success else {
                // Not Kapelka's answer (a login page, a proxy): the same clientId makes the next try safe
                return .retryLater(after: nil)
            }
            return .sent(CaptureReply(status: reply.data.status, title: reply.data.ack.title, summary: reply.data.ack.summary))
        case 400:
            return .rejected(ErrorBody.message(in: body) ?? "Сервер не принял запись")
        case 401, 403:
            return .tokenRefused
        case 429:
            let seconds = retryAfter.flatMap(TimeInterval.init).flatMap { $0.isFinite ? $0 : nil }
            return .retryLater(after: min(max(seconds ?? defaultRetryAfter, 0), maxRetryAfter))
        default:
            return .retryLater(after: nil)
        }
    }
}

private struct RequestBody: Encodable {
    let text: String
    let clientId: String
    let capturedAt: String

    init(_ capture: Capture) {
        text = capture.text
        clientId = capture.clientId.uuidString.lowercased()
        capturedAt = CapturedAt.string(capture)
    }
}

/// The fields of a payment (`docs/QUICK_CAPTURE_API.md`, «Payment request»). A `nil` key is not sent at all.
private struct PaymentBody: Encodable {
    let amount: String
    let currency: String
    let merchant: String?
    let accountName: String?
    let clientId: String
    let capturedAt: String

    /// Throws for a payment that stays on the phone: one never goes out without an amount and its currency.
    init(_ capture: Capture, _ payment: Payment, accountName: String?) throws(PaymentNotSendable) {
        guard let amount = payment.amount, let currency = payment.currency.flatMap(PaymentCurrency.init(rawValue:)) else {
            throw PaymentNotSendable()
        }
        self.amount = amount
        self.currency = currency.rawValue
        merchant = payment.merchant
        self.accountName = accountName
        clientId = capture.clientId.uuidString.lowercased()
        capturedAt = CapturedAt.string(capture)
    }
}

struct PaymentNotSendable: Error {}

/// The moment of input with the offset the phone had then: `2026-10-29T14:32:05+05:00` (FT-175).
private enum CapturedAt {
    static func string(_ capture: Capture) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(identifier: capture.timeZoneIdentifier) ?? .current
        return formatter.string(from: capture.capturedAt)
    }
}

private struct SuccessBody: Decodable {
    struct Payload: Decodable {
        struct Ack: Decodable {
            let title: String
            let summary: String
        }

        let status: String
        let ack: Ack
    }

    let success: Bool
    let data: Payload
}

/// Errors come nested from the handler and flat from middleware (`docs/QUICK_CAPTURE_API.md`, «Errors»).
private enum ErrorBody {
    private struct Nested: Decodable {
        struct Detail: Decodable { let message: String }
        let error: Detail
    }

    private struct Flat: Decodable {
        let error: String
    }

    static func message(in body: Data) -> String? {
        let decoder = JSONDecoder()
        if let nested = try? decoder.decode(Nested.self, from: body) { return nested.error.message }
        return (try? decoder.decode(Flat.self, from: body))?.error
    }
}
