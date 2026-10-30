import Foundation
import Testing
@testable import Kapelka

@Suite("Удаление ждущей записи")
struct CaptureDeleteTests {
    @Test("удалённая ждущая запись не уходит, остальные уходят")
    func deletedIsNotSent() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        let wrong = try await queue.add("кофе 250к")
        let right = try await queue.add("кофе 25к")

        #expect(try await queue.remove(wrong.clientId))
        await queue.flush()

        #expect(try await harness.transport.sentClientIds() == [right.clientId.uuidString.lowercased()])
        #expect(try harness.store.load().captures.map(\.text) == ["кофе 25к"])
    }

    @Test("удаление записано на диск: после перезапуска запись не возвращается")
    func deletionSurvivesRestart() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let capture = try await harness.makeQueue().add("кофе 250к")

        #expect(try await harness.makeQueue().remove(capture.clientId))

        #expect(try harness.store.load().captures.isEmpty)
    }

    @Test("отправленную и отклонённую с телефона не удалить — их правят в Mini App")
    func finishedStay() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(400, body: ServerReply.textTooLong)]))
        let queue = harness.makeQueue()
        let rejected = try await queue.add("кофе 250к")
        let sent = try await queue.add("кофе 25к")
        await queue.flush()

        #expect(try await queue.remove(rejected.clientId) == false)
        #expect(try await queue.remove(sent.clientId) == false)
        #expect(try harness.store.load().captures.map(\.state) == [.rejected, .sent])
    }

    @Test("удалили, пока запрос в пути, а сервер её записал — запись возвращается записанной")
    func deletedInFlightButWritten() async throws {
        let harness = try QueueHarness(transport: FakeTransport(latency: .milliseconds(100)))
        let queue = harness.makeQueue()
        let capture = try await queue.add("кофе 250к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        #expect(try await queue.remove(capture.clientId))
        #expect(await queue.state().captures.isEmpty)
        await sending

        let captures = try harness.store.load().captures
        #expect(captures.map(\.clientId) == [capture.clientId])
        #expect(captures.map(\.state) == [.sent])
    }

    @Test("удалили, пока запрос в пути, а сервер не ответил — запись больше не уходит, остальные уходят")
    func deletedInFlightNotWritten() async throws {
        let harness = try QueueHarness(transport: FakeTransport(
            [.failure(.cannotConnectToHost)],
            latency: .milliseconds(100)
        ))
        let queue = harness.makeQueue()
        let wrong = try await queue.add("кофе 250к")
        _ = try await queue.add("такси 18к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        #expect(try await queue.remove(wrong.clientId))
        await sending
        #expect(try harness.store.load().captures.map(\.text) == ["такси 18к"])
        await queue.flush()

        #expect(try await harness.transport.bodies().map(\.text) == ["кофе 250к", "такси 18к"])
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }
}
