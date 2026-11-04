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
            ("http://127.0.0.1:3177", "http://127.0.0.1:3177"),
        ]
    )
    func normalizesAddress(raw: String, expected: String) {
        #expect(ServerAddress.normalized(raw)?.absoluteString == expected)
    }

    @Test(
        "не адрес или http не на этой машине — отказ: токен ушёл бы открытым текстом",
        arguments: [
            "", "   ", "ftp://kapelka.ts.net", "https://", "два слова",
            "http://kapelka-pc.example-tailnet.ts.net", "http://192.168.1.5:3000",
        ]
    )
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
