import Foundation
import Testing
@testable import Kapelka

@Suite("Ввод адреса и токена")
struct ServerSettingsInputTests {
    @Test(
        "адрес сводится к схеме, хосту и порту",
        arguments: [
            ("kapelka-pc.example-tailnet.ts.net", "https://kapelka-pc.example-tailnet.ts.net"),
            ("https://kapelka-pc.example-tailnet.ts.net/", "https://kapelka-pc.example-tailnet.ts.net"),
            ("  https://kapelka-pc.example-tailnet.ts.net/webapp/  ", "https://kapelka-pc.example-tailnet.ts.net"),
            ("http://localhost:3177", "http://localhost:3177"),
        ]
    )
    func normalizesAddress(raw: String, expected: String) {
        #expect(ServerAddress.normalized(raw)?.absoluteString == expected)
    }

    @Test("не адрес — отказ", arguments: ["", "   ", "ftp://kapelka.ts.net", "https://", "два слова"])
    func refusesAddress(raw: String) {
        #expect(ServerAddress.normalized(raw) == nil)
    }

    @Test("токен без пробелов по краям")
    func trimsToken() throws {
        #expect(try CaptureToken.validated("  \(TestSettings.token)\n") == TestSettings.token)
    }

    @Test("токен не годится для заголовка — отказ", arguments: ["", "  ", "два слова", "токен", "a\tb"])
    func refusesToken(raw: String) {
        #expect(throws: SettingsError.badToken) { try CaptureToken.validated(raw) }
    }
}

@Suite("Проверить связь")
struct HealthCheckTests {
    @Test("GET /api/health без токена; 200 — сервер доступен")
    func available() async throws {
        let transport = FakeTransport([.http(200, body: #"{"status":"healthy"}"#)])
        let status = await HealthCheck(transport: transport).run(base: TestSettings.address)

        #expect(status == .available)
        let request = try #require(await transport.requests.first)
        #expect(request.httpMethod == "GET")
        #expect(request.url?.absoluteString == "https://kapelka-pc.example-tailnet.ts.net/api/health")
        #expect(request.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == nil)
    }

    @Test("ответ с ошибкой — сервер ответил, с кодом")
    func answeredWithError() async {
        let transport = FakeTransport([.http(503, body: #"{"status":"unhealthy"}"#)])
        #expect(await HealthCheck(transport: transport).run(base: TestSettings.address) == .answered(503))
    }

    @Test("нет ответа — не отвечает", arguments: [URLError.Code.timedOut, .cannotFindHost, .notConnectedToInternet])
    func unreachable(code: URLError.Code) async {
        let transport = FakeTransport([.failure(code)])
        #expect(await HealthCheck(transport: transport).run(base: TestSettings.address) == .unreachable)
    }
}
