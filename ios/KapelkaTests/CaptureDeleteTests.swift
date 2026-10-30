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

    @Test("запись, чей запрос в пути, не удаляется: сервер может её записать")
    func sendingIsNotDeleted() async throws {
        let harness = try QueueHarness(transport: FakeTransport(latency: .milliseconds(100)))
        let queue = harness.makeQueue()
        let capture = try await queue.add("кофе 250к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        #expect(await queue.state().sendingId == capture.clientId)
        #expect(try await queue.remove(capture.clientId) == false)
        await sending

        #expect(try harness.store.load().captures.map(\.state) == [.sent])
        #expect(await queue.state().sendingId == nil)
    }

    @Test("запрос не дошёл — запись снова ждёт, её можно удалить, и она больше не уходит")
    func deletableAgainAfterFailedSend() async throws {
        let harness = try QueueHarness(transport: FakeTransport(
            [.failure(.timedOut)],
            latency: .milliseconds(100)
        ))
        let queue = harness.makeQueue()
        let wrong = try await queue.add("кофе 250к")
        _ = try await queue.add("такси 18к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        #expect(try await queue.remove(wrong.clientId) == false)
        await sending
        #expect(try await queue.remove(wrong.clientId))
        await queue.flush()

        #expect(try await harness.transport.bodies().map(\.text) == ["кофе 250к", "такси 18к"])
        #expect(try harness.store.load().captures.map(\.text) == ["такси 18к"])
    }

    @Test("номер записи в пути на диск не пишется")
    func sendingIdNotSaved() async throws {
        let harness = try QueueHarness(transport: FakeTransport(latency: .milliseconds(100)))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await queue.state().sendingId != nil })
        let file = try String(contentsOf: harness.store.fileURL, encoding: .utf8)
        await sending

        #expect(!file.contains("sendingId"))
    }
}
