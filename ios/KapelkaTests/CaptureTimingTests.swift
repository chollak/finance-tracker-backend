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

    @Test("отмена чужим вызовом (лимит «Отправить очередь») — вызов, начавший отправку, начинает её снова")
    func ownerRestartsAfterOthersCancel() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.hang]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let opened: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        let shortcut = Task { await queue.flush() }
        try await Task.sleep(for: .milliseconds(50))
        shortcut.cancel()
        await queue.cancelSending()
        await shortcut.value
        await opened

        #expect(try harness.store.load().captures.map(\.state) == [.sent])
        #expect(await harness.transport.requests.count == 2)
    }

    @Test("дополнительный проход для присоединившегося вызова оборвали — он начинается снова")
    func cutExtraPassRestarts() async throws {
        let harness = try QueueHarness(transport: FakeTransport(
            [.failure(.cannotConnectToHost), .hang],
            latency: .milliseconds(50)
        ))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let first: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        async let joined: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 2 })
        await queue.cancelSending()
        await first
        await joined

        #expect(try harness.store.load().captures.map(\.state) == [.sent])
        #expect(await harness.transport.requests.count == 3)
    }

    @Test("отменённые вызовы после отмены отправку снова не начинают — так фон укладывается во время iOS")
    func cancelledCallersDoNotRestart() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.hang]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        let background = Task { await queue.flush() }
        #expect(await eventually { await harness.transport.requests.count == 1 })
        let joined = Task { await queue.flush() }
        try await Task.sleep(for: .milliseconds(50))
        background.cancel()
        joined.cancel()
        await queue.cancelSending()
        await background.value
        await joined.value

        #expect(await harness.transport.requests.count == 1)
        #expect(try harness.store.load().captures.map(\.state) == [.pending])
    }
}
