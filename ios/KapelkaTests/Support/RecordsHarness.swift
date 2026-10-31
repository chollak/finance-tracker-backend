import Foundation
@testable import Kapelka

/// Bodies of the records routes as the server sends them (`docs/pastel/api.md`). A record has the fields of
/// `mapToTransaction` in `SqliteTransactionRepository.ts`: the example in `api.md` shortens them to `"…": "…"`.
enum RecordsReply {
    static func record(
        id: String = "3f1c0d2e-7a4b-4c55-9d8e-2a6f1b3c4d5e",
        date: String = "2026-10-29",
        createdAt: String = "2026-10-29T09:32:05.000Z",
        type: String = "expense",
        amountMinor: Int = 2_500_000,
        currency: String = "UZS",
        categoryId: String = "cat-cafe",
        category: String = "Кафе",
        description: String = "кофе",
        merchant: String? = nil,
        needsReview: Bool = false
    ) -> String {
        let merchantJSON = merchant.map { "\"\($0)\"" } ?? "null"
        return """
            {"id":"\(id)","amountMinor":\(amountMinor),"amount":\(Double(amountMinor) / 100),"type":"\(type)",\
            "semanticType":"\(type)","needsReview":\(needsReview),"description":"\(description)","date":"\(date)",\
            "userId":"user-uuid","merchant":\(merchantJSON),"originalText":"\(description)","categoryId":"\(categoryId)",\
            "category":"\(category)","categoryColor":"rose","accountId":"acc-card","currency":"\(currency)",\
            "source":"ios_shortcut","isArchived":false,"createdAt":"\(createdAt)"}
            """
    }

    /// `GET /api/transactions`: `summary` is `null` without a search or a filter (FT-116).
    static func page(_ items: [String], nextCursor: String? = nil, summary: String = "null") -> String {
        let cursor = nextCursor.map { "\"\($0)\"" } ?? "null"
        return """
            {"success":true,"data":{"items":[\(items.joined(separator: ","))],"nextCursor":\(cursor),\
            "summary":\(summary)},"timestamp":"2026-10-29T10:00:00.000Z"}
            """
    }

    /// The category of `api.md`, «Категории (FT-099)», word for word.
    static func category(
        id: String = "cat-cafe",
        type: String = "expense",
        name: String = "Кафе",
        isHidden: Bool = false
    ) -> String {
        """
        {"id":"\(id)","type":"\(type)","name":"\(name)","color":"rose","isHidden":\(isHidden),\
        "isOther":false,"sortOrder":20,"presetKey":"cafe","userId":"user-uuid"}
        """
    }

    static func categories(_ items: [String]) -> String {
        #"{"success":true,"data":[\#(items.joined(separator: ","))],"timestamp":"2026-10-29T10:00:00.000Z"}"#
    }

    /// `POST /:id/restore` and `PUT /:id`: the record whole.
    static func one(_ record: String, message: String? = nil) -> String {
        let messageJSON = message.map { #","message":"\#($0)""# } ?? ""
        return #"{"success":true,"data":\#(record)\#(messageJSON),"timestamp":"2026-10-29T10:00:00.000Z"}"#
    }

    /// `DELETE /:id` (FT-105).
    static func deleted(_ id: String) -> String {
        """
        {"success":true,"data":{"message":"Transaction deleted successfully","id":"\(id)"},\
        "message":"Transaction deleted successfully","timestamp":"2026-10-29T10:00:00.000Z"}
        """
    }

    /// `handleControllerError` for a `NotFoundError('Transaction', id)`.
    static func recordNotFound(_ id: String) -> String {
        """
        {"success":false,"error":{"code":"NOT_FOUND","message":"Transaction not found: \(id)",\
        "timestamp":"2026-10-29T10:00:00.000Z"}}
        """
    }

    /// `PUT { categoryId }` with a category that is not the user's any more (`categoryCatalog.ts`).
    static func categoryNotFound(_ id: String) -> String {
        """
        {"success":false,"error":{"code":"NOT_FOUND","message":"Category not found: \(id)",\
        "timestamp":"2026-10-29T10:00:00.000Z"}}
        """
    }

    /// `notFoundHandler`: a route the server does not have.
    static let routeNotFound = """
        {"success":false,"error":"Route DELETE /api/transactions/x not found","code":"NOT_FOUND"}
        """

    static let categoryTypeMismatch = """
        {"success":false,"error":{"code":"VALIDATION_ERROR","message":"Category type does not match the record",\
        "timestamp":"2026-10-29T10:00:00.000Z"}}
        """
}

/// One cache file in its own temporary folder, removed with the harness. `makeFeed()` again over the same file is
/// the app started anew.
final class RecordsHarness: Sendable {
    let cache: RecordsCacheFile
    let clock = TestClock()
    let transport: FakeTransport
    let settings: TestSettings

    init(transport: FakeTransport = FakeTransport(), settings: TestSettings = TestSettings()) throws {
        cache = RecordsCacheFile(fileURL: try TestFolders.make().appending(path: "records.json"))
        self.transport = transport
        self.settings = settings
    }

    deinit {
        try? FileManager.default.removeItem(at: cache.fileURL.deletingLastPathComponent())
    }

    var client: RecordsClient {
        let settings = settings
        return RecordsClient(configuration: { settings.configuration }, transport: transport)
    }

    func makeFeed() -> RecordsFeed {
        let clock = clock
        return RecordsFeed(client: client, cache: cache, now: { clock.now })
    }
}
