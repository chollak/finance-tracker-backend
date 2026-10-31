import Foundation
import os

/// Why a call to the records routes did not do what was asked (FT-219, «ответы»).
enum RecordsFailure: Error, Equatable, Sendable {
    /// No address or token yet: nothing was sent.
    case notConfigured
    /// 401, 403: the token or the owner is wrong — «проверь токен», as with the queue.
    case tokenRefused
    /// 404 «Transaction not found» on delete, restore or edit: deleted elsewhere — in the Mini App or the bot.
    case recordGone
    /// 404 «Category not found» on edit: the record lives, the list of categories is old.
    case categoryGone
    /// No network, timeout, 5xx, 408, 429, and any answer that is not Kapelka's (a proxy, a Wi-Fi login page): the
    /// list from the cache.
    case unreachable
    /// 400 and the other 4xx: the server refused the request itself. Its own text, for the log.
    case refused(String)

    /// What the screen says.
    var message: String {
        switch self {
        case .notConfigured: "Укажи адрес и токен в настройках Kapelka"
        case .tokenRefused: "Сервер не принял токен — проверь токен в настройках Kapelka"
        case .recordGone: "Запись уже удалена"
        case .categoryGone: "Этой категории уже нет — открой список заново"
        case .unreachable: "Нет связи — попробуй позже"
        case .refused: "Сервер не принял запрос"
        }
    }
}

/// The records routes of the app token (FT-218) with the same address and token as the queue (`SettingsStore`,
/// `CaptureClient`): the history page by page, the categories, delete, restore and a new category
/// (`docs/pastel/api.md`). No retries and nothing queued: an edit without a network is refused (decision 2026-10-31).
struct RecordsClient: Sendable {
    /// A read on the tailnet answers in well under a second; the screen should not wait for a minute as the queue does.
    static let timeout: TimeInterval = 15
    /// The server's own default (FT-107).
    static let pageSize = 50

    private static let logger = Logger(subsystem: "kapelka", category: "records-client")

    let configuration: @Sendable () -> ServerConfiguration?
    let transport: any HTTPTransport

    /// The first page without `cursor`, then `nextCursor` of the page before.
    func page(after cursor: String? = nil, limit: Int = pageSize) async throws(RecordsFailure) -> RecordsPage {
        try await call(.page(cursor: cursor, limit: limit), answer: RecordsPage.self)
    }

    /// All the user's categories, hidden too.
    func categories() async throws(RecordsFailure) -> [RecordCategory] {
        try await call(.categories, answer: LossyList<RecordCategory>.self).elements
    }

    /// Deletes softly (FT-105): `restore` brings the record back.
    func delete(_ id: String) async throws(RecordsFailure) {
        _ = try await call(.delete(id: id), answer: Deleted.self)
    }

    func restore(_ id: String) async throws(RecordsFailure) -> Record {
        try await call(.restore(id: id), answer: Record.self)
    }

    /// `PUT { categoryId }` only: amount, account and date stay in the Mini App. The server learns from it (FT-184).
    func setCategory(_ categoryId: String, of id: String) async throws(RecordsFailure) -> Record {
        try await call(.setCategory(id: id, categoryId: categoryId), answer: Record.self)
    }

    /// The same client with the settings of this moment: a page is saved under the address it came from.
    func pinned(to configuration: ServerConfiguration) -> RecordsClient {
        RecordsClient(configuration: { configuration }, transport: transport)
    }

    private func call<Answer: Decodable>(
        _ route: Route,
        answer: Answer.Type
    ) async throws(RecordsFailure) -> Answer {
        guard let configuration = configuration() else { throw .notConfigured }
        let request = route.request(to: configuration)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport.data(for: request)
        } catch {
            Self.logger.info("Records \(route.name, privacy: .public): no answer, \(error.localizedDescription, privacy: .public)")
            throw .unreachable
        }
        guard let http = response as? HTTPURLResponse else { throw .unreachable }
        Self.logger.info("Records \(route.name, privacy: .public): HTTP \(http.statusCode, privacy: .public)")
        guard (200..<300).contains(http.statusCode) else {
            throw Self.failure(status: http.statusCode, body: data, editsRecord: route.editsRecord)
        }
        guard let envelope = try? JSONDecoder().decode(Envelope<Answer>.self, from: data), envelope.success else {
            // Not Kapelka's answer: a login page or a proxy; or a contract the app does not know yet
            Self.logger.error("Records \(route.name, privacy: .public): the answer is not readable")
            throw .unreachable
        }
        return envelope.data
    }

    static func failure(status: Int, body: Data, editsRecord: Bool) -> RecordsFailure {
        switch status {
        case 401, 403:
            return .tokenRefused
        case 404:
            // Only the record's own «not found»; a route the server lacks or a proxy's 404 says nothing about it
            guard editsRecord, let notFound = ErrorBody.notFound(in: body) else { return .unreachable }
            return notFound
        case 408, 429:
            return .unreachable
        case 400..<500:
            return .refused(ErrorBody.message(in: body) ?? "HTTP \(status)")
        default:
            return .unreachable
        }
    }
}

private enum Route {
    case page(cursor: String?, limit: Int)
    case categories
    case delete(id: String)
    case restore(id: String)
    case setCategory(id: String, categoryId: String)

    /// For the log: never ids, amounts or names.
    var name: String {
        switch self {
        case .page: "page"
        case .categories: "categories"
        case .delete: "delete"
        case .restore: "restore"
        case .setCategory: "category"
        }
    }

    /// A 404 on these is about the record.
    var editsRecord: Bool {
        switch self {
        case .page, .categories: false
        case .delete, .restore, .setCategory: true
        }
    }

    func request(to configuration: ServerConfiguration) -> URLRequest {
        let api = configuration.baseURL.appending(path: "api")
        var request: URLRequest
        switch self {
        case let .page(cursor, limit):
            let query = (cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? [])
                + [URLQueryItem(name: "limit", value: String(limit))]
            request = URLRequest(url: api.appending(path: "transactions").appending(queryItems: query))
            request.httpMethod = "GET"
        case .categories:
            request = URLRequest(url: api.appending(path: "categories"))
            request.httpMethod = "GET"
        case let .delete(id):
            request = URLRequest(url: Self.record(id, in: api))
            request.httpMethod = "DELETE"
        case let .restore(id):
            request = URLRequest(url: Self.record(id, in: api).appending(path: "restore"))
            request.httpMethod = "POST"
        case let .setCategory(id, categoryId):
            request = URLRequest(url: Self.record(id, in: api))
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONEncoder().encode(["categoryId": categoryId])
        }
        request.timeoutInterval = RecordsClient.timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(configuration.token, forHTTPHeaderField: "X-Shortcut-Capture-Token")
        return request
    }

    /// The id as one path segment, «/» encoded: it cannot lead to another route.
    private static func record(_ id: String, in api: URL) -> URL {
        api.appending(path: "transactions").appending(component: id)
    }
}

private struct Envelope<Payload: Decodable>: Decodable {
    let success: Bool
    let data: Payload
}

/// `DELETE /api/transactions/:id` answers `{ message, id }`.
private struct Deleted: Decodable {
    let id: String
}

/// Errors come nested from a handler and flat from middleware (`docs/QUICK_CAPTURE_API.md`, «Errors»).
private enum ErrorBody {
    private struct Nested: Decodable {
        struct Detail: Decodable {
            let code: String?
            let message: String
        }

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

    /// `NotFoundError('Transaction', id)` or `NotFoundError('Category', id)` from `handleControllerError`.
    static func notFound(in body: Data) -> RecordsFailure? {
        guard let detail = try? JSONDecoder().decode(Nested.self, from: body).error, detail.code == "NOT_FOUND" else {
            return nil
        }
        if detail.message.hasPrefix("Transaction not found") { return .recordGone }
        if detail.message.hasPrefix("Category not found") { return .categoryGone }
        return nil
    }
}
