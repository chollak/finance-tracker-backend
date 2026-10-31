import Foundation
import Testing
@testable import Kapelka

/// The five routes the app token opens (FT-218), as the records client calls them (FT-219).
@Suite("Клиент записей: запросы")
struct RecordsClientTests {
    private let base = "https://kapelka-pc.example-tailnet.ts.net"
    private let id = "3f1c0d2e-7a4b-4c55-9d8e-2a6f1b3c4d5e"

    @Test("первая страница: GET /api/transactions?limit=50, токен в заголовке, как у очереди")
    func firstPage() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.page([]))]))
        _ = try await harness.client.page()

        let request = try #require(await harness.transport.requests.first)
        #expect(request.httpMethod == "GET")
        #expect(request.url?.absoluteString == "\(base)/api/transactions?limit=50")
        #expect(request.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
        #expect(request.value(forHTTPHeaderField: "Accept") == "application/json")
        #expect(request.httpBody == nil)
        #expect(request.timeoutInterval == RecordsClient.timeout)
    }

    @Test("следующая страница — с курсором прошлой")
    func nextPage() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.page([]))]))
        _ = try await harness.client.page(after: "WyIyMDI2LTEwLTE2Iiwi_-x", limit: 20)

        let request = try #require(await harness.transport.requests.first)
        #expect(request.url?.absoluteString == "\(base)/api/transactions?cursor=WyIyMDI2LTEwLTE2Iiwi_-x&limit=20")
    }

    @Test("категории: GET /api/categories")
    func categories() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.categories([]))]))
        #expect(try await harness.client.categories().isEmpty)

        let request = try #require(await harness.transport.requests.first)
        #expect(request.httpMethod == "GET")
        #expect(request.url?.absoluteString == "\(base)/api/categories")
        #expect(request.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
    }

    @Test("удалить: DELETE /api/transactions/:id")
    func delete() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.deleted(id))]))
        try await harness.client.delete(id)

        let request = try #require(await harness.transport.requests.first)
        #expect(request.httpMethod == "DELETE")
        #expect(request.url?.absoluteString == "\(base)/api/transactions/\(id)")
        #expect(request.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
        #expect(request.httpBody == nil)
    }

    @Test("вернуть: POST /api/transactions/:id/restore")
    func restore() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.one(RecordsReply.record()))]))
        _ = try await harness.client.restore(id)

        let request = try #require(await harness.transport.requests.first)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "\(base)/api/transactions/\(id)/restore")
        #expect(request.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
    }

    @Test("сменить категорию: PUT /api/transactions/:id и в теле только categoryId")
    func setCategory() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.one(RecordsReply.record()))]))
        _ = try await harness.client.setCategory("cat-food", of: id)

        let request = try #require(await harness.transport.requests.first)
        #expect(request.httpMethod == "PUT")
        #expect(request.url?.absoluteString == "\(base)/api/transactions/\(id)")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
        let body = try JSONSerialization.jsonObject(with: try #require(request.httpBody)) as? [String: String]
        #expect(body == ["categoryId": "cat-food"])
    }

    @Test("id записи — один сегмент пути: «/» и «..» не уводят на другой маршрут")
    func idIsOnePathSegment() async throws {
        let harness = try RecordsHarness(transport: FakeTransport([.http(200, body: RecordsReply.deleted("x"))]))
        try await harness.client.delete("../accounts")

        let request = try #require(await harness.transport.requests.first)
        #expect(request.url?.absoluteString == "\(base)/api/transactions/..%2Faccounts")
    }

    @Test("нет адреса или токена — запрос не уходит, «укажи адрес и токен»")
    func notConfigured() async throws {
        let harness = try RecordsHarness(settings: TestSettings(configured: false))
        let client = harness.client

        await #expect(throws: RecordsFailure.notConfigured) { try await client.page() }
        await #expect(throws: RecordsFailure.notConfigured) { try await client.categories() }
        await #expect(throws: RecordsFailure.notConfigured) { try await client.delete(id) }
        await #expect(throws: RecordsFailure.notConfigured) { try await client.restore(id) }
        await #expect(throws: RecordsFailure.notConfigured) { try await client.setCategory("cat-food", of: id) }
        #expect(await harness.transport.requests.isEmpty)
    }
}
