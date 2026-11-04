import Foundation
import Testing
@testable import Kapelka

/// Whether a waiting record may already be on the server (FT-256): a request that got no answer to trust once it had
/// left the phone may have been written; one that never left it, or an answer that says it wrote nothing, was not.
/// Deleting a record on the phone says «уже уходила на сервер» only for the first.
@Suite("Очередь: могла ли запись уже быть на сервере")
struct QueueOnServerTests {
    @Test(
        "нет сети и отказ в соединении — не дошла; таймаут, обрыв в пути, 5xx и чужая страница — могла записаться",
        arguments: [
            (FakeTransport.Reply.failure(.notConnectedToInternet), false),
            (.failure(.dataNotAllowed), false),
            // Tailscale off: the name of the PC in the tailnet does not resolve
            (.failure(.cannotFindHost), false),
            // Nothing listens: the connection was never made
            (.failure(.cannotConnectToHost), false),
            // Lost on the way: the request may have been written before it broke
            (.failure(.networkConnectionLost), true),
            (.failure(.timedOut), true),
            (.http(500, body: "{}"), true),
            (.http(502, body: "Bad Gateway"), true),
            (.http(200, body: "<html>login</html>"), true),
            // The server answered that it wrote nothing
            (.http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "120"]), false),
            (.http(401, body: ServerReply.invalidToken), false),
        ]
    )
    func byTheAttempt(reply: FakeTransport.Reply, mayBeOnServer: Bool) async throws {
        let harness = try QueueHarness(transport: FakeTransport([reply]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()

        let saved = try #require(try harness.store.load().captures.first)
        #expect(saved.state == .pending)
        #expect(saved.mayBeOnServer == mayBeOnServer)
    }

    @Test("одна попытка, которая могла записать, — признак остаётся и после попыток без сети, и после перезапуска")
    func keptOverAttempts() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.timedOut), .failure(.notConnectedToInternet)]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()
        await queue.flush()

        #expect(await queue.state().wait == .offline)
        #expect(await harness.makeQueue().state().captures.map(\.mayBeOnServer) == [true])
    }

    @Test("запрос оборвали (кончилось время фона) — не попытка, но ПК не ответил и запись могла дойти")
    func cutShort() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.hang]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")

        let background = Task { await queue.flush() }
        #expect(await eventually { await harness.transport.requests.count == 1 })
        background.cancel()
        await queue.cancelSending()
        await background.value

        let saved = try harness.store.load()
        #expect(saved.captures.map(\.attempts) == [0])
        #expect(saved.captures.map(\.mayBeOnServer) == [true])
        #expect(saved.wait == .noAnswer)
    }

    @Test(
        "сервер в этом проходе записал или отказал, потом время вышло на длинной очереди — не «сервер не ответил» (#219)",
        arguments: [
            (FakeTransport.Reply.http(200), Capture.State.sent),
            (.http(400, body: ServerReply.textTooLong), .rejected),
        ]
    )
    func cutShortAfterAnswer(answer: FakeTransport.Reply, answered: Capture.State) async throws {
        let harness = try QueueHarness(transport: FakeTransport([answer, .hang]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        _ = try await queue.add("такси 18к")

        await cutShortOnRequest(2, queue, harness)

        let saved = try harness.store.load()
        #expect(saved.captures.map(\.state) == [answered, .pending])
        #expect(saved.captures.map(\.attempts) == [1, 0])
        // Cut short, it may have been written all the same, as in `cutShort`
        #expect(saved.captures.last?.mayBeOnServer == true)
        // The reason the server's answer left: none
        #expect(saved.wait == nil)
    }

    @Test("ответ был в прошлом проходе, в этом сервер молчит до обрыва — «сервер не ответил»")
    func cutShortAfterEarlierPass() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(200), .hang]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()
        _ = try await queue.add("такси 18к")

        await cutShortOnRequest(2, queue, harness)

        let saved = try harness.store.load()
        #expect(saved.captures.map(\.state) == [.sent, .pending])
        #expect(saved.wait == .noAnswer)
    }

    /// The background's time runs out while request `number` waits for its answer.
    private func cutShortOnRequest(_ number: Int, _ queue: CaptureQueue, _ harness: QueueHarness) async {
        let background = Task { await queue.flush() }
        #expect(await eventually { await harness.transport.requests.count == number })
        background.cancel()
        await queue.cancelSending()
        await background.value
    }

    @Test("удаление отдаёт запись, как её убрали с телефона, — с признаком; уже отправляется — ничего")
    func removeGivesTheRecord() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.timedOut), .hang]))
        let queue = harness.makeQueue()
        let tried = try await queue.add("кофе 25к")
        await queue.flush()

        let removed = try #require(try await queue.remove(tried.clientId))
        #expect(removed.clientId == tried.clientId)
        #expect(removed.mayBeOnServer)

        let sending = try await queue.add("такси 18к")
        let run = Task { await queue.flush() }
        #expect(await eventually { await queue.state().sendingId == sending.clientId })
        #expect(try await queue.remove(sending.clientId) == nil)

        run.cancel()
        await queue.cancelSending()
        await run.value
    }

    @Test("файл до FT-256 без признака читается: ходившая на сервер запись считается дошедшей, как раньше")
    func readsFileBeforeTheFlag() throws {
        let older = """
            {"captures":[\
            {"attempts":2,"capturedAt":815000000,"clientId":"3903229C-4ACB-4547-8620-13DC3B9FAA9E","state":"pending",\
            "text":"кофе 25к","timeZoneIdentifier":"Asia/Tashkent"},\
            {"attempts":0,"capturedAt":815000060,"clientId":"7C1D3E38-29A6-4F0B-9E63-8C6F2D1B5A40","state":"pending",\
            "text":"такси 18к","timeZoneIdentifier":"Asia/Tashkent"}],\
            "tokenRefused":false,"wait":"offline"}
            """

        let state = try JSONDecoder().decode(QueueState.self, from: Data(older.utf8))

        #expect(state.captures.map(\.text) == ["кофе 25к", "такси 18к"])
        #expect(state.captures.map(\.mayBeOnServer) == [true, false])
        #expect(state.wait == .offline)
    }
}
