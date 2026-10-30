import Foundation
import Testing
@testable import Kapelka

/// When a pass ends and what a caller waits for (from the review of FT-177).
@Suite("Очередь: паузы и отмена")
struct CaptureTimingTests {
    @Test("после 429 очередь уходит сама, когда пауза Retry-After кончилась")
    func sendsWhenRetryAfterEnds() async throws {
        let harness = try QueueHarness(
            transport: FakeTransport([.http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "30"])]),
            retryWait: TestRetryWait.passes
        )
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()

        #expect(try await eventually { try harness.store.load().captures.map(\.state) == [.sent] })
        #expect(await harness.transport.requests.count == 2)
        #expect(harness.retryWait.waits == [30])
    }

    @Test("пауза после 429, сохранённая до перезапуска, тоже кончается сама")
    func sendsWhenSavedPauseEnds() async throws {
        let harness = try QueueHarness(
            transport: FakeTransport([.http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "300"])])
        )
        _ = try await harness.makeQueue().add("кофе 25к")
        await harness.makeQueue().flush()
        harness.clock.advance(by: 100)

        let wait = TestRetryWait.passes(harness.clock)
        await harness.makeQueue(retryWait: wait).flush()

        #expect(try await eventually { try harness.store.load().captures.map(\.state) == [.sent] })
        #expect(await harness.transport.requests.count == 2)
        #expect(wait.waits == [200])
    }

    @Test("вызов, присоединившийся к отправке, возвращается после дополнительного прохода, а не раньше")
    func joinedCallerWaitsForItsPass() async throws {
        let harness = try QueueHarness(transport: FakeTransport(
            [.failure(.cannotConnectToHost)],
            latency: .milliseconds(50)
        ))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let first: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        await queue.flush()

        #expect(try harness.store.load().captures.map(\.state) == [.sent])
        await first
    }

    @Test("повод отправить, пришедший до отмены, не теряется: отправка начинается снова")
    func triggerBeforeCancelIsKept() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.hang]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let background: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        async let opened: Void = queue.flush()
        try await Task.sleep(for: .milliseconds(50))
        await queue.cancelSending()
        await background
        await opened

        #expect(try harness.store.load().captures.map(\.state) == [.sent])
        #expect(await harness.transport.requests.count == 2)
    }

    @Test("отменённый вызов, ждавший отправку, после отмены её снова не начинает")
    func cancelledCallerDoesNotRestart() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.hang]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let background: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        let joined = Task { await queue.flush() }
        try await Task.sleep(for: .milliseconds(50))
        joined.cancel()
        await queue.cancelSending()
        await background
        await joined.value

        #expect(await harness.transport.requests.count == 1)
        #expect(try harness.store.load().captures.map(\.state) == [.pending])
    }
}
