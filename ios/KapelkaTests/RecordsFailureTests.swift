import Foundation
import Testing
@testable import Kapelka

/// What each answer of the records routes means for the screen (FT-219, «ответы»): 401 and 403 — «проверь токен» as
/// with the queue; 404 on delete or edit — «запись уже удалена»; no network, timeout, 5xx — «нет связи».
@Suite("Клиент записей: ответы")
struct RecordsFailureTests {
    private let id = "3f1c0d2e-7a4b-4c55-9d8e-2a6f1b3c4d5e"

    /// Every call of the client, the same server answer for each. Plain `throws`: a typed-throws function type needs
    /// the runtime of iOS 18, and the app runs on 17.
    private static let calls: [(String, @Sendable (RecordsClient) async throws -> Void)] = [
        ("page", { client in _ = try await client.page() }),
        ("categories", { client in _ = try await client.categories() }),
        ("accounts", { client in _ = try await client.accounts() }),
        ("delete", { client in try await client.delete("r") }),
        ("restore", { client in _ = try await client.restore("r") }),
        ("category", { client in _ = try await client.setCategory("c", of: "r") }),
    ]

    @Test(
        "401 и 403 — «проверь токен», как у очереди",
        arguments: [
            FakeTransport.Reply.http(401, body: ServerReply.invalidToken),
            .http(403, body: #"{"success":false,"error":"Shortcut capture is disabled","code":"SHORTCUT_CAPTURE_DISABLED"}"#),
            .http(403, body: ""),
        ]
    )
    func tokenRefused(reply: FakeTransport.Reply) async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .tokenRefused, "\(name)")
        }
        #expect(RecordsFailure.tokenRefused.message == "Сервер не принял токен — проверь токен в настройках Kapelka")
    }

    @Test(
        "нет сети, таймаут, 5xx, 429 — «нет связи»",
        arguments: [
            FakeTransport.Reply.failure(.notConnectedToInternet),
            .failure(.cannotConnectToHost),
            .failure(.cannotFindHost),
            .failure(.timedOut),
            .failure(.networkConnectionLost),
            .http(500, body: #"{"success":false,"error":{"code":"INTERNAL_ERROR","message":"x"}}"#),
            .http(502, body: "Bad Gateway"),
            .http(503, body: ""),
            .http(408, body: ""),
            .http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "60"]),
            .http(302, body: "", headers: ["Location": "https://login.example.com"]),
        ]
    )
    func unreachable(reply: FakeTransport.Reply) async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .unreachable, "\(name)")
        }
        #expect(RecordsFailure.unreachable.message == "Нет связи — попробуй позже")
    }

    @Test("2xx не от Kapelka (страница входа в Wi-Fi) — «нет связи»")
    func foreignSuccess() async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: .http(200, body: "<html>Wi-Fi login</html>"))
            #expect(failure == .unreachable, "\(name)")
        }
    }

    @Test("404 «запись не найдена» на удаление, возврат и смену категории — «запись уже удалена»")
    func recordGone() async throws {
        let reply = FakeTransport.Reply.http(404, body: RecordsReply.recordNotFound(id))
        for (name, call) in Self.calls where ["delete", "restore", "category"].contains(name) {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .recordGone, "\(name)")
        }
        #expect(RecordsFailure.recordGone.message == "Запись уже удалена")
    }

    @Test("404 «категория не найдена» на смену категории — не «запись удалена»: запись жива, устарел список категорий")
    func categoryGone() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(404, body: RecordsReply.categoryNotFound("cat-x"))]))
        let client = harness.client
        await #expect(throws: RecordsFailure.categoryGone) { try await client.setCategory("cat-x", of: id) }
        #expect(RecordsFailure.categoryGone.message == "Категории уже нет")
    }

    @Test(
        "404 не от записи — нет такого маршрута, прокси, чужая страница — «нет связи», запись не считается удалённой",
        arguments: [
            FakeTransport.Reply.http(404, body: RecordsReply.routeNotFound),
            .http(404, body: "Not Found"),
            .http(404, body: ""),
        ]
    )
    func foreignNotFound(reply: FakeTransport.Reply) async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .unreachable, "\(name)")
        }
    }

    @Test("400 — сервер не принял запрос: его текст для журнала, на экран — по-русски")
    func refused() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(400, body: RecordsReply.categoryTypeMismatch)]))
        let client = harness.client
        await #expect(throws: RecordsFailure.refused("Category type does not match the record")) {
            try await client.setCategory("cat-salary", of: id)
        }
        #expect(RecordsFailure.refused("Category type does not match the record").message == "Сервер не принял запрос")
    }

    @Test("409 и 400 без тела — тоже «не принял», с кодом ответа")
    func refusedWithoutText() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(409, body: ""), .http(400, body: "bad")]))
        let client = harness.client
        await #expect(throws: RecordsFailure.refused("HTTP 409")) { try await client.delete(id) }
        await #expect(throws: RecordsFailure.refused("HTTP 400")) { try await client.page(after: "broken") }
    }

    @Test("нет адреса или токена — «укажи адрес и токен»")
    func notConfiguredMessage() {
        #expect(RecordsFailure.notConfigured.message == "Укажи адрес и токен в настройках Kapelka")
    }

    private func failure(
        of call: @Sendable (RecordsClient) async throws -> Void,
        answering reply: FakeTransport.Reply
    ) async throws -> RecordsFailure? {
        let harness = try RecordsHarness(transport: FakeTransport([reply]))
        do {
            try await call(harness.client)
            return nil
        } catch let failure as RecordsFailure {
            return failure
        }
    }
}
