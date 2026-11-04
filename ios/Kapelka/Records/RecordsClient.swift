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
    /// No answer to go by, for the reason the queue names (#282, `QueueWait`): no network or Tailscale off —
    /// `offline`; a timeout (the PC asleep), 5xx, 408, a 404 not about the record, an answer that is not Kapelka's (a
    /// proxy, a Wi-Fi login page) — `noAnswer`; 429 — `busy`. The list from the cache; an edit changes nothing.
    case later(QueueWait)
    /// 400 and the other 4xx: the server refused the request itself. Its text goes to the log (`RecordsClient`).
    case refused

    /// The short reason after «Не вернул «такси» —», in the words of the card on «Записать» (`LastPhrase`).
    var reason: String {
        switch self {
        case .notConfigured: "нет адреса и токена"
        case .tokenRefused: "сервер не принял токен"
        case .recordGone: "запись уже удалена"
        case .categoryGone: "категории уже нет"
        case .later(.offline): "нет связи"
        case .later(.noAnswer): "сервер не ответил"
        case .later(.busy): "сервер просит подождать"
        case .refused: "сервер не принял запрос"
        }
    }

    /// The reason alone, as a sentence starts: the line over the list, the screen without a cache.
    var title: String {
        reason.prefix(1).uppercased() + reason.dropFirst()
    }

    /// What the bar and the sheet say.
    var message: String {
        switch self {
        case .notConfigured: "Укажи адрес и токен в настройках Kapelka"
        case .tokenRefused: "Сервер не принял токен — проверь токен в настройках Kapelka"
        case .recordGone, .categoryGone, .refused: title
        case .later: "\(title) — попробуй позже"
        }
    }
}

/// The records routes of the app token (FT-218) with the same address and token as the queue (`SettingsStore`,
/// `CaptureClient`): the history page by page, the categories, the account names, delete, restore and a new category
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

    /// All the user's accounts, hidden too: the names for the list's rows (FT-218, read only).
    func accounts() async throws(RecordsFailure) -> [RecordAccount] {
        try await call(.accounts, answer: RecordAccounts.self).accounts
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

    /// «Да, верно» (FT-254): `PUT { needsReview: false }` only — «!» goes, nothing else changes. The server learns
    /// nothing from it: no category changed.
    func confirm(_ id: String) async throws(RecordsFailure) -> Record {
        try await call(.confirm(id: id), answer: Record.self)
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
            // The queue's own reading of the error: «Записи» and the card on «Записать» say the same at the same minute
            throw .later(QueueWait.of(error))
        }
        guard let http = response as? HTTPURLResponse else { throw .later(.noAnswer) }
        Self.logger.info("Records \(route.name, privacy: .public): HTTP \(http.statusCode, privacy: .public)")
        guard (200..<300).contains(http.statusCode) else {
            let failure = Self.failure(status: http.statusCode, body: data, editsRecord: route.editsRecord)
            if failure == .refused {
                Self.logRefusal(route, status: http.statusCode, body: data)
            }
            throw failure
        }
        guard let envelope = try? JSONDecoder().decode(Envelope<Answer>.self, from: data), envelope.success else {
            // Not Kapelka's answer: a login page or a proxy; or a contract the app does not know yet
            Self.logger.error("Records \(route.name, privacy: .public): the answer is not readable")
            throw .later(.noAnswer)
        }
        return envelope.data
    }

    /// A 4xx other than 401, 403, 404, 408 and 429 is the server refusing the request; 429 is «просит подождать», as for
    /// the queue (`CaptureClient.outcome`); anything else that is not the records' answer is «сервер не ответил».
    static func failure(status: Int, body: Data, editsRecord: Bool) -> RecordsFailure {
        switch status {
        case 401, 403:
            return .tokenRefused
        case 404:
            // Only the record's own «not found»; a route the server lacks or a proxy's 404 says nothing about it
            guard editsRecord, let notFound = ServerError(body: body)?.notFound else { return .later(.noAnswer) }
            return notFound
        case 429:
            return .later(.busy)
        case 408:
            return .later(.noAnswer)
        case 400..<500:
            return .refused
        default:
            return .later(.noAnswer)
        }
    }

    /// The route, the status and the server's code in the open; its text private — it may name a category or carry an
    /// id («Category «Кафе» is for expenses…»), and the device's log is not only the app's.
    private static func logRefusal(_ route: Route, status: Int, body: Data) {
        let server = ServerError(body: body)
        let code = server?.code ?? "no code"
        let text = server?.message ?? "no text"
        logger.notice("""
            Records \(route.name, privacy: .public): refused, HTTP \(status, privacy: .public) \
            \(code, privacy: .public): \(text, privacy: .private)
            """)
    }
}

private enum Route {
    case page(cursor: String?, limit: Int)
    case categories
    case accounts
    case delete(id: String)
    case restore(id: String)
    case setCategory(id: String, categoryId: String)
    case confirm(id: String)

    /// For the log: never ids, amounts or names.
    var name: String {
        switch self {
        case .page: "page"
        case .categories: "categories"
        case .accounts: "accounts"
        case .delete: "delete"
        case .restore: "restore"
        case .setCategory: "category"
        case .confirm: "confirm"
        }
    }

    /// A 404 on these is about the record.
    var editsRecord: Bool {
        switch self {
        case .page, .categories, .accounts: false
        case .delete, .restore, .setCategory, .confirm: true
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
        case .accounts:
            request = URLRequest(url: api.appending(path: "accounts"))
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
        case let .confirm(id):
            request = URLRequest(url: Self.record(id, in: api))
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONEncoder().encode(["needsReview": false])
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

private extension ServerError {
    /// `NotFoundError('Transaction', id)` or `NotFoundError('Category', id)` from `handleControllerError`; the
    /// `notFoundHandler`'s «Route … not found» is neither.
    var notFound: RecordsFailure? {
        guard code == "NOT_FOUND" else { return nil }
        if message.hasPrefix("Transaction not found") { return .recordGone }
        if message.hasPrefix("Category not found") { return .categoryGone }
        return nil
    }
}
