import Foundation
import Testing
@testable import Kapelka

/// Each answer of `POST /api/quick-capture` and what the queue does with it (FT-161, «Как устроено»).
@Suite("Ответы сервера")
struct CaptureSendingRulesTests {
    @Test("запрос: адрес, токен в заголовке, фраза, clientId и время ввода")
    func buildsRequest() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        let capture = try await queue.add("кофе 25к")
        await queue.flush()

        let request = try #require(await harness.transport.requests.first)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "https://kapelka-pc.example-tailnet.ts.net/api/quick-capture")
        #expect(request.value(forHTTPHeaderField: "X-Shortcut-Capture-Token") == TestSettings.token)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        let body = try #require(try await harness.transport.bodies().first)
        #expect(body == .init(
            text: "кофе 25к",
            clientId: capture.clientId.uuidString.lowercased(),
            capturedAt: "2026-10-29T14:32:05+05:00"
        ))
    }

    @Test("2xx — записано, с итогом сервера")
    func savedOnSuccess() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(200, body: ServerReply.saved(status: "needs_review", title: "Нужно проверить", summary: "Перевел · 500 000 сум")),
        ]))
        let queue = harness.makeQueue()
        _ = try await queue.add("перевел 500к")
        await queue.flush()

        let capture = try #require(try harness.store.load().captures.first)
        #expect(capture.state == .sent)
        #expect(capture.reply == CaptureReply(status: "needs_review", title: "Нужно проверить", summary: "Перевел · 500 000 сум"))
        #expect(capture.attempts == 1)
    }

    @Test("2xx не от Kapelka — запись ждёт: повтор с тем же clientId безопасен")
    func unknownSuccessBodyKeepsWaiting() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(200, body: "<html>Wi-Fi login</html>")]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()

        #expect(try harness.store.load().captures.map(\.state) == [.pending])
    }

    @Test(
        "нет сети, таймаут, 502, 5xx — запись ждёт, следующие в этот раз не пробуются",
        arguments: [
            FakeTransport.Reply.failure(.notConnectedToInternet),
            .failure(.cannotConnectToHost),
            .failure(.timedOut),
            .failure(.networkConnectionLost),
            .http(502, body: "Bad Gateway"),
            .http(500, body: #"{"success":false,"error":{"code":"INTERNAL_ERROR","message":"x"}}"#),
            .http(503, body: ""),
            .http(408, body: ""),
            .http(404, body: "Not Found"),
        ]
    )
    func transientFailureKeepsWaiting(reply: FakeTransport.Reply) async throws {
        let harness = try QueueHarness(transport: FakeTransport([reply]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        _ = try await queue.add("такси 18к")
        await queue.flush()

        #expect(await harness.transport.requests.count == 1)
        let captures = try harness.store.load().captures
        #expect(captures.map(\.state) == [.pending, .pending])
        #expect(captures.map(\.attempts) == [1, 0])

        await queue.flush()
        #expect(try harness.store.load().captures.map(\.state) == [.sent, .sent])
    }

    @Test("429 — следующая попытка не раньше Retry-After")
    func rateLimitWaitsForRetryAfter() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "120"]),
        ]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()

        harness.clock.advance(by: 119)
        await queue.flush()
        #expect(await harness.transport.requests.count == 1)
        #expect(try harness.store.load().captures.map(\.state) == [.pending])

        harness.clock.advance(by: 1)
        await queue.flush()
        #expect(await harness.transport.requests.count == 2)
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("429 без Retry-After — пауза минута")
    func rateLimitWithoutHeader() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(429, body: ServerReply.rateLimited)]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()

        harness.clock.advance(by: 59)
        await queue.flush()
        #expect(await harness.transport.requests.count == 1)
        harness.clock.advance(by: 1)
        await queue.flush()
        #expect(await harness.transport.requests.count == 2)
    }

    @Test("пауза после 429 переживает перезапуск приложения")
    func rateLimitPauseSurvivesRestart() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "300"]),
        ]))
        _ = try await harness.makeQueue().add("кофе 25к")
        await harness.makeQueue().flush()

        await harness.makeQueue().flush()
        #expect(await harness.transport.requests.count == 1)
    }

    @Test("Retry-After больше часа или не число — пауза не дольше часа")
    func retryAfterIsClamped() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "99999999"]),
            .http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "inf"]),
        ]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()
        harness.clock.advance(by: 3600)
        await queue.flush()
        #expect(await harness.transport.requests.count == 2)

        harness.clock.advance(by: 60)
        await queue.flush()
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("401 на запрос со старым токеном не останавливает очередь, если токен уже сменили")
    func lateRefusalAfterNewToken() async throws {
        let harness = try QueueHarness(transport: FakeTransport(
            [.http(401, body: ServerReply.invalidToken)],
            latency: .milliseconds(100)
        ))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        await queue.settingsChanged()
        await sending

        #expect(try harness.store.load().tokenRefused == false)
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("401 и 403 — стоп, «проверь токен»; после смены настроек очередь уходит", arguments: [401, 403])
    func refusedTokenStopsQueue(status: Int) async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(status, body: ServerReply.invalidToken)]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        _ = try await queue.add("такси 18к")
        await queue.flush()

        #expect(try harness.store.load().tokenRefused)
        await queue.flush()
        await harness.makeQueue().flush()
        #expect(await harness.transport.requests.count == 1)
        #expect(try harness.store.load().captures.map(\.state) == [.pending, .pending])

        await queue.settingsChanged()
        await queue.flush()
        #expect(try harness.store.load().tokenRefused == false)
        #expect(try harness.store.load().captures.map(\.state) == [.sent, .sent])
    }

    @Test("400 — ошибка у записи, больше не уходит; очередь идёт дальше")
    func rejectedRecordIsNotSentAgain() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(400, body: ServerReply.textTooLong)]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        _ = try await queue.add("такси 18к")
        await queue.flush()

        let captures = try harness.store.load().captures
        #expect(captures.map(\.state) == [.rejected, .sent])
        #expect(captures.first?.rejection == "Text is too long (maximum 2000 characters)")
        #expect(await harness.transport.requests.count == 2)
    }

    @Test("без адреса или токена ничего не уходит; настроили — уходит")
    func waitsForSettings() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()
        #expect(await harness.transport.requests.isEmpty)
        #expect(try harness.store.load().captures.first?.attempts == 0)

        harness.settings.set(ServerConfiguration(baseURL: TestSettings.address, token: TestSettings.token))
        await queue.settingsChanged()
        await queue.flush()
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("уходят по одной, старые первыми")
    func oldestFirst() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        _ = try await queue.add("первая")
        harness.clock.advance(by: 60)
        _ = try await queue.add("вторая")
        harness.clock.advance(by: 60)
        _ = try await queue.add("третья")
        await queue.flush()

        #expect(try await harness.transport.bodies().map(\.text) == ["первая", "вторая", "третья"])
    }
}
