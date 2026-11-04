import Foundation
import Testing
@testable import Kapelka

/// What each answer of the records routes means for the screen (FT-219, «ответы»): 401 and 403 — «проверь токен» as
/// with the queue; 404 on delete or edit — «запись уже удалена»; the rest in the words of the card on «Записать» (#282):
/// no network — «нет связи», timeout and 5xx — «сервер не ответил», 429 — «сервер просит подождать».
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
        "нет сети или не находится имя ПК (Tailscale выключен) — «Нет связи»",
        arguments: [
            FakeTransport.Reply.failure(.notConnectedToInternet),
            .failure(.networkConnectionLost),
            .failure(.dataNotAllowed),
            .failure(.internationalRoamingOff),
            .failure(.cannotFindHost),
            .failure(.dnsLookupFailed),
        ]
    )
    func offline(reply: FakeTransport.Reply) async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .later(.offline), "\(name)")
        }
        #expect(RecordsFailure.later(.offline).message == "Нет связи — попробуй позже")
        #expect(RecordsFailure.later(.offline).reason == "нет связи")
    }

    @Test(
        "сервер не ответил или ответил ошибкой — таймаут (ПК спит), 5xx, 408, перенаправление — «Сервер не ответил»",
        arguments: [
            FakeTransport.Reply.failure(.timedOut),
            .failure(.cannotConnectToHost),
            .failure(.secureConnectionFailed),
            .http(500, body: #"{"success":false,"error":{"code":"INTERNAL_ERROR","message":"x"}}"#),
            .http(502, body: "Bad Gateway"),
            .http(503, body: ""),
            .http(408, body: ""),
            .http(302, body: "", headers: ["Location": "https://login.example.com"]),
        ]
    )
    func noAnswer(reply: FakeTransport.Reply) async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .later(.noAnswer), "\(name)")
        }
        #expect(RecordsFailure.later(.noAnswer).message == "Сервер не ответил — попробуй позже")
        #expect(RecordsFailure.later(.noAnswer).reason == "сервер не ответил")
    }

    @Test("429 — «Сервер просит подождать»")
    func busy() async throws {
        let reply = FakeTransport.Reply.http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "60"])
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .later(.busy), "\(name)")
        }
        #expect(RecordsFailure.later(.busy).message == "Сервер просит подождать — попробуй позже")
        #expect(RecordsFailure.later(.busy).reason == "сервер просит подождать")
    }

    @Test(
        "коды URLError разбирает функция очереди (QueueWait.of): что карточка «Записать», то и «Записи»",
        arguments: [
            URLError.Code.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff,
            .cannotFindHost, .dnsLookupFailed, .timedOut, .cannotConnectToHost, .secureConnectionFailed, .cancelled,
            .badServerResponse, .unknown,
        ]
    )
    func sameCodesAsTheQueue(code: URLError.Code) async throws {
        let failure = try await failure(of: { client in _ = try await client.page() }, answering: .failure(code))
        #expect(failure == .later(QueueWait.of(URLError(code))))
    }

    @Test("2xx не от Kapelka (страница входа в Wi-Fi) — «Сервер не ответил»")
    func foreignSuccess() async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: .http(200, body: "<html>Wi-Fi login</html>"))
            #expect(failure == .later(.noAnswer), "\(name)")
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
        "404 не от записи — нет такого маршрута, прокси, чужая страница — «Сервер не ответил», запись не считается удалённой",
        arguments: [
            FakeTransport.Reply.http(404, body: RecordsReply.routeNotFound),
            .http(404, body: "Not Found"),
            .http(404, body: ""),
        ]
    )
    func foreignNotFound(reply: FakeTransport.Reply) async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .later(.noAnswer), "\(name)")
        }
    }

    @Test(
        "400 и другие 4xx — сервер ответил отказом: «Сервер не принял запрос», не «Нет связи»",
        arguments: [
            FakeTransport.Reply.http(400, body: RecordsReply.categoryTypeMismatch),
            .http(400, body: "bad"),
            .http(409, body: ""),
            .http(422, body: #"{"success":false,"error":{"code":"BUSINESS_LOGIC_ERROR","message":"x"}}"#),
        ]
    )
    func refused(reply: FakeTransport.Reply) async throws {
        for (name, call) in Self.calls {
            let failure = try await failure(of: call, answering: reply)
            #expect(failure == .refused, "\(name)")
        }
        #expect(RecordsFailure.refused.message == "Сервер не принял запрос")
        #expect(RecordsFailure.refused.reason == "сервер не принял запрос")
    }

    @Test("коротко, с заглавной — подпись над списком и экран без кэша")
    func titles() {
        #expect(RecordsFailure.later(.offline).title == "Нет связи")
        #expect(RecordsFailure.later(.noAnswer).title == "Сервер не ответил")
        #expect(RecordsFailure.later(.busy).title == "Сервер просит подождать")
        #expect(RecordsFailure.refused.title == "Сервер не принял запрос")
        #expect(RecordsFailure.tokenRefused.title == "Сервер не принял токен")
    }

    @Test("значок причины — как у карточки «Записать»: Wi-Fi только без связи, ключ у токена")
    func symbols() {
        #expect(RecordsFailure.later(.offline).systemImage == "wifi.slash")
        #expect(RecordsFailure.later(.noAnswer).systemImage == "clock")
        #expect(RecordsFailure.later(.busy).systemImage == "hourglass")
        #expect(RecordsFailure.tokenRefused.systemImage == "key")
        #expect(RecordsFailure.notConfigured.systemImage == "gearshape")
        #expect(RecordsFailure.refused.systemImage == "xmark.circle")
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
