import Foundation
import Testing
@testable import Kapelka

/// «Проверить связь» (#283): `GET /api/health` without the token — is it Kapelka, and does its bot poll Telegram; then,
/// only from Kapelka, `GET /api/categories` with the token of the field, or the saved one when the field is empty.
@Suite("Проверить связь")
struct HealthCheckTests {
    private static let address = TestSettings.address.absoluteString
    private static let typedToken = "typed-token-fedcba9876543210fedcba9876543210"

    /// What the server of this repository answers (`healthRoutes.ts`, `tests/healthRoute.test.ts`).
    static let healthy = """
        {"status":"healthy","timestamp":"2026-11-05T10:00:00.000Z","uptime":125.4,"version":"1.0.0",\
        "environment":"production","telegramBot":{"state":"running","attempts":1}}
        """
    static let botFailed = """
        {"status":"unhealthy","timestamp":"2026-11-05T10:00:00.000Z","uptime":125.4,"version":"1.0.0",\
        "environment":"production","telegramBot":{"state":"failed","attempts":5,"lastError":"409: Conflict"}}
        """
    static let categories = RecordsReply.categories([RecordsReply.category()])

    private static func check(
        _ health: FakeTransport.Reply,
        _ token: FakeTransport.Reply? = nil,
        address: String = address,
        typed: String = "",
        saved: String? = TestSettings.token
    ) async -> (ConnectionReport, [URLRequest]) {
        let transport = FakeTransport([health] + (token.map { [$0] } ?? []))
        let report = await HealthCheck(transport: transport).run(address: address, typedToken: typed, savedToken: saved)
        return (report, await transport.requests)
    }

    // MARK: - Kapelka and the token

    @Test("Kapelka и токен верны — сервер доступен, токен принят")
    func accepted() async throws {
        let (report, requests) = await Self.check(.http(200, body: Self.healthy), .http(200, body: Self.categories))

        #expect(report == .kapelka(botWorks: true, token: .accepted))
        #expect(report.text == "Сервер доступен, токен принят")
        try #require(requests.count == 2)
        let health = requests[0]
        #expect(health.httpMethod == "GET")
        #expect(health.url?.absoluteString == "https://kapelka-pc.example-tailnet.ts.net/api/health")
        #expect(health.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == nil)
        #expect(health.timeoutInterval == HealthCheck.timeout)
        let categories = requests[1]
        #expect(categories.httpMethod == "GET")
        #expect(categories.url?.absoluteString == "https://kapelka-pc.example-tailnet.ts.net/api/categories")
        #expect(categories.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
        #expect(categories.value(forHTTPHeaderField: "Accept") == "application/json")
        #expect(categories.timeoutInterval == HealthCheck.timeout)
    }

    @Test(
        "401 и 403 — сервер не принял токен",
        arguments: [
            FakeTransport.Reply.http(401, body: ServerReply.invalidToken),
            .http(403, body: #"{"success":false,"error":"Shortcut capture is not set up on this server","code":"SHORTCUT_CAPTURE_DISABLED"}"#),
            .http(403, body: #"{"success":false,"error":"This Telegram account has no access","code":"ACCESS_NOT_ALLOWED"}"#),
        ]
    )
    func refused(reply: FakeTransport.Reply) async {
        let (report, requests) = await Self.check(.http(200, body: Self.healthy), reply)

        #expect(report == .kapelka(botWorks: true, token: .refused))
        #expect(report.text == "Сервер не принял токен")
        #expect(requests.count == 2)
    }

    @Test("пустое поле — проверяется сохранённый токен", arguments: ["", "   \n"])
    func emptyFieldSendsSavedToken(typed: String) async throws {
        let (report, requests) = await Self.check(
            .http(200, body: Self.healthy), .http(200, body: Self.categories), typed: typed
        )

        #expect(report == .kapelka(botWorks: true, token: .accepted))
        let categories = try #require(requests.last)
        #expect(categories.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
    }

    @Test("токен в поле — проверяется он, а не сохранённый")
    func typedTokenGoesFirst() async throws {
        let (_, requests) = await Self.check(
            .http(200, body: Self.healthy), .http(200, body: Self.categories), typed: "  \(Self.typedToken)\n"
        )

        let categories = try #require(requests.last)
        #expect(categories.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == Self.typedToken)
    }

    @Test("ни в поле, ни сохранённого — вставь токен, токен не проверяется")
    func noToken() async {
        let (report, requests) = await Self.check(.http(200, body: Self.healthy), saved: nil)

        #expect(report == .kapelka(botWorks: true, token: .missing))
        #expect(report.text == "Сервер доступен — вставь токен")
        #expect(requests.count == 1)
    }

    @Test("токен в поле не годится для заголовка — тот же текст, что у «Сохранить», ничего не уходит")
    func malformedToken() async {
        let (report, requests) = await Self.check(.http(200, body: Self.healthy), typed: "два слова")

        #expect(report == .kapelka(botWorks: true, token: .malformed))
        #expect(report.text == "Сервер доступен. \(SettingsMessage.text(for: .badToken))")
        #expect(requests.count == 1)
    }

    @Test(
        "токен не проверен — нет ответа, 429, 5xx, 404, не тело Kapelka",
        arguments: [
            FakeTransport.Reply.failure(.timedOut),
            .failure(.notConnectedToInternet),
            .http(429, body: ServerReply.rateLimited),
            .http(500, body: #"{"success":false,"error":{"code":"INTERNAL_ERROR","message":"boom"}}"#),
            .http(404, body: "Not Found"),
            .http(200, body: "<html>login</html>"),
            .http(200, body: #"{"success":false,"data":[]}"#),
        ]
    )
    func tokenNotChecked(reply: FakeTransport.Reply) async {
        let (report, _) = await Self.check(.http(200, body: Self.healthy), reply)

        #expect(report == .kapelka(botWorks: true, token: .unknown))
        #expect(report.text == "Сервер доступен, токен не проверен — попробуй позже")
    }

    // MARK: - The bot

    @Test("503 бота — сервер доступен, запись с iPhone работает")
    func botFailed() async {
        let (report, requests) = await Self.check(.http(503, body: Self.botFailed), .http(200, body: Self.categories))

        #expect(report == .kapelka(botWorks: false, token: .accepted))
        #expect(report.text == "Сервер доступен, токен принят. Бот Telegram не работает — запись с iPhone работает")
        #expect(requests.count == 2)
    }

    @Test("503 бота и токен не принят — запись с iPhone не обещается")
    func botFailedTokenRefused() async {
        let (report, _) = await Self.check(.http(503, body: Self.botFailed), .http(401, body: ServerReply.invalidToken))

        #expect(report == .kapelka(botWorks: false, token: .refused))
        #expect(report.text == "Сервер не принял токен. Бот Telegram не работает")
    }

    // MARK: - Not Kapelka, no answer

    @Test(
        "чужой сервер — по этому адресу отвечает не Kapelka, токен ему не уходит",
        arguments: [
            FakeTransport.Reply.http(200, body: "<html>Wi-Fi login</html>"),
            .http(200, body: ""),
            .http(200, body: #"{"status":"ok"}"#),
            .http(200, body: #"{"status":"healthy"}"#),
            .http(200, body: #"{"telegramBot":{"state":"running"}}"#),
            .http(404, body: "Not Found"),
            .http(302, body: "", headers: ["Location": "https://login.example.com"]),
        ]
    )
    func notKapelka(reply: FakeTransport.Reply) async {
        let (report, requests) = await Self.check(reply)

        #expect(report == .notKapelka)
        #expect(report.text == "По этому адресу отвечает не Kapelka — проверь адрес")
        #expect(requests.count == 1)
    }

    @Test("сеть недоступна — нет связи", arguments: [URLError.Code.notConnectedToInternet, .cannotFindHost, .dataNotAllowed])
    func offline(code: URLError.Code) async {
        let (report, requests) = await Self.check(.failure(code))

        #expect(report == .noAnswer(.offline))
        #expect(report.text == "Нет связи — проверь сеть, Tailscale и адрес")
        #expect(requests.count == 1)
    }

    @Test(
        "таймаут, 5xx не от Kapelka — сервер не ответил",
        arguments: [
            FakeTransport.Reply.failure(.timedOut),
            .failure(.cannotConnectToHost),
            .http(502, body: ""),
            .http(504, body: "<html>Gateway Timeout</html>"),
            .http(408, body: ""),
        ]
    )
    func noAnswer(reply: FakeTransport.Reply) async {
        let (report, requests) = await Self.check(reply)

        #expect(report == .noAnswer(.noAnswer))
        #expect(report.text == "Сервер не ответил — ПК спит или Kapelka не запущена")
        #expect(requests.count == 1)
    }

    @Test("429 на /api/health — сервер просит подождать")
    func busy() async {
        let (report, _) = await Self.check(.http(429, body: ServerReply.rateLimited))

        #expect(report == .noAnswer(.busy))
        #expect(report.text == "Сервер просит подождать — попробуй позже")
    }

    // MARK: - The address

    @Test(
        "адрес — тот же ServerAddress: http не на этой машине и не адрес — ничего не уходит",
        arguments: ["", "http://kapelka-pc.example-tailnet.ts.net", "http://192.168.1.5:3000", "два слова"]
    )
    func badAddress(raw: String) async {
        let (report, requests) = await Self.check(.http(200, body: Self.healthy), address: raw)

        #expect(report == .badAddress)
        #expect(report.text == SettingsMessage.badAddress)
        #expect(requests.isEmpty)
    }

    @Test("адрес сводится, как у «Сохранить»: путь Mini App отпадает, http — для localhost")
    func normalizedAddress() async throws {
        let (_, pasted) = await Self.check(
            .http(200, body: Self.healthy), .http(200, body: Self.categories),
            address: "kapelka-pc.example-tailnet.ts.net/webapp/"
        )
        #expect(pasted.map { $0.url?.absoluteString } == [
            "https://kapelka-pc.example-tailnet.ts.net/api/health",
            "https://kapelka-pc.example-tailnet.ts.net/api/categories",
        ])

        let (_, local) = await Self.check(
            .http(200, body: Self.healthy), .http(200, body: Self.categories), address: "http://localhost:3177"
        )
        #expect(local.first?.url?.absoluteString == "http://localhost:3177/api/health")
    }

    // MARK: - Nothing changes

    @Test("проверка только читает: два GET, без тела")
    func readsOnly() async {
        let (_, requests) = await Self.check(.http(200, body: Self.healthy), .http(200, body: Self.categories))

        #expect(requests.map(\.httpMethod) == ["GET", "GET"])
        #expect(requests.allSatisfy { $0.httpBody == nil })
    }
}
