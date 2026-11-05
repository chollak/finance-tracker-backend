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

        #expect(try await queue.remove(wrong.clientId) != nil)
        await queue.flush()

        #expect(try await harness.transport.sentClientIds() == [right.clientId.uuidString.lowercased()])
        #expect(try harness.store.load().captures.map(\.text) == ["кофе 25к"])
    }

    @Test("удаление записано на диск: после перезапуска запись не возвращается")
    func deletionSurvivesRestart() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let capture = try await harness.makeQueue().add("кофе 250к")

        #expect(try await harness.makeQueue().remove(capture.clientId) != nil)

        #expect(try harness.store.load().captures.isEmpty)
    }

    @Test("отправленную и отклонённую с телефона не удалить — их правят в Mini App")
    func finishedStay() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(400, body: ServerReply.textTooLong)]))
        let queue = harness.makeQueue()
        let rejected = try await queue.add("кофе 250к")
        let sent = try await queue.add("кофе 25к")
        await queue.flush()

        #expect(try await queue.remove(rejected.clientId) == nil)
        #expect(try await queue.remove(sent.clientId) == nil)
        #expect(try harness.store.load().captures.map(\.state) == [.rejected, .sent])
    }

    @Test("запись, чей запрос в пути, не удаляется: сервер может её записать")
    func sendingIsNotDeleted() async throws {
        let answer = Gate()
        let harness = try QueueHarness(transport: FakeTransport([.held(answer, .http(200))]))
        let queue = harness.makeQueue()
        let capture = try await queue.add("кофе 250к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        #expect(await queue.state().sendingId == capture.clientId)
        #expect(try await queue.remove(capture.clientId) == nil)
        answer.open()
        await sending

        #expect(try harness.store.load().captures.map(\.state) == [.sent])
        #expect(await queue.state().sendingId == nil)
    }

    @Test("запрос не дошёл — запись снова ждёт, её можно удалить, и она больше не уходит")
    func deletableAgainAfterFailedSend() async throws {
        let answer = Gate()
        let harness = try QueueHarness(transport: FakeTransport([.held(answer, .failure(.timedOut))]))
        let queue = harness.makeQueue()
        let wrong = try await queue.add("кофе 250к")
        _ = try await queue.add("такси 18к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 1 })
        #expect(try await queue.remove(wrong.clientId) == nil)
        answer.open()
        await sending
        #expect(try await queue.remove(wrong.clientId) != nil)
        await queue.flush()

        #expect(try await harness.transport.bodies().map(\.text) == ["кофе 250к", "такси 18к"])
        #expect(try harness.store.load().captures.map(\.text) == ["такси 18к"])
    }

    @Test("свайп «Удалить»: запрос не уходил с телефона (нет сети) — молча; уходил (таймаут) — «проверь «Записи»» (FT-256)")
    func swipeTellsOnlyWhenItMayBeOnServer() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet), .failure(.timedOut)]))
        let queue = harness.makeQueue()
        let offline = try await queue.add("кофе 250к")
        await queue.flush()
        #expect(CaptureRow.deleteNote(try await queue.remove(offline.clientId)) == nil)

        let timedOut = try await queue.add("такси 18к")
        await queue.flush()
        #expect(
            CaptureRow.deleteNote(try await queue.remove(timedOut.clientId))
                == "Удалено. Запись уже уходила на сервер — проверь «Записи»"
        )
    }

    @Test("свайп «Удалить», а запрос уже ушёл — не удалено, и сказано почему")
    func swipeWhileSending() {
        #expect(CaptureRow.deleteNote(nil) == "Запись уже отправляется — если сервер её запишет, удали её в «Записях»")
    }

    @Test("номер записи в пути на диск не пишется")
    func sendingIdNotSaved() async throws {
        let answer = Gate()
        let harness = try QueueHarness(transport: FakeTransport([.held(answer, .http(200))]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        async let sending: Void = queue.flush()
        #expect(await eventually { await queue.state().sendingId != nil })
        let file = try String(contentsOf: harness.store.fileURL, encoding: .utf8)
        answer.open()
        await sending

        #expect(!file.contains("sendingId"))
    }
}
