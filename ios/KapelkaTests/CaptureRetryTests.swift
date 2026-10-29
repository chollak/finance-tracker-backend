import Foundation
import Testing
@testable import Kapelka

@Suite("Повторы без дублей")
struct CaptureRetryTests {
    @Test("ответ потерялся — повтор идёт с тем же clientId, запись одна")
    func retryAfterLostAnswerKeepsClientId() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .failure(.timedOut),
            .http(200, body: ServerReply.saved()),
        ]))
        let queue = harness.makeQueue()
        let capture = try await queue.add("кофе 25к")
        await queue.flush()
        harness.clock.advance(by: 3600)
        await queue.flush()

        let id = capture.clientId.uuidString.lowercased()
        #expect(try await harness.transport.sentClientIds() == [id, id])
        #expect(harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("две отправки одновременно не шлют одну запись дважды")
    func concurrentFlushesSendEachOnce() async throws {
        let harness = try QueueHarness(transport: FakeTransport(latency: .milliseconds(30)))
        let queue = harness.makeQueue()
        for text in ["кофе 25к", "такси 18к", "обед 60к"] {
            _ = try await queue.add(text)
        }

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<5 {
                group.addTask { await queue.flush() }
            }
        }

        let ids = try await harness.transport.sentClientIds()
        #expect(ids.count == 3)
        #expect(Set(ids).count == 3)
        #expect(harness.store.load().captures.map(\.state) == [.sent, .sent, .sent])
    }

    @Test("запись, добавленная во время отправки, уходит в ту же отправку")
    func captureAddedWhileSendingIsSent() async throws {
        let harness = try QueueHarness(transport: FakeTransport(latency: .milliseconds(50)))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let sending: Void = queue.flush()
        try await Task.sleep(for: .milliseconds(10))
        _ = try await queue.add("такси 18к")
        await queue.flush()
        await sending

        #expect(harness.store.load().captures.map(\.state) == [.sent, .sent])
        #expect(await harness.transport.requests.count == 2)
    }

    @Test("capturedAt — время ввода, а не отправки, с часовым поясом телефона")
    func capturedAtIsTimeOfInput() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        harness.clock.advance(by: 2 * 24 * 3600 + 3 * 3600)
        harness.settings.set(ServerConfiguration(baseURL: TestSettings.address, token: TestSettings.token))
        await queue.flush()

        #expect(try await harness.transport.bodies().map(\.capturedAt) == ["2026-10-29T14:32:05+05:00"])
    }

    @Test("отменённая отправка оставляет запись ждать")
    func cancelledSendKeepsWaiting() async throws {
        let harness = try QueueHarness(transport: FakeTransport(latency: .seconds(5)))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        await queue.cancelSending()
        await sending

        #expect(harness.store.load().captures.map(\.state) == [.pending])
    }
}
