import Foundation
import Testing
@testable import Kapelka

/// Why a record waits (FT-252): the card on «Записать» tells «Нет связи», «Сервер не ответил» and «Сервер просит
/// подождать» apart, so the queue keeps the reason of the last attempt that ended «позже» — on disk too.
@Suite("Очередь: почему ждёт")
struct QueueWaitTests {
    @Test(
        "нет сети на телефоне — «нет связи»; сервер молчит или ошибся — «не ответил»",
        arguments: [
            (FakeTransport.Reply.failure(.notConnectedToInternet), QueueWait.offline),
            (.failure(.networkConnectionLost), .offline),
            (.failure(.dataNotAllowed), .offline),
            // Tailscale off: the name of the PC in the tailnet does not resolve
            (.failure(.cannotFindHost), .offline),
            (.failure(.timedOut), .noAnswer),
            (.failure(.cannotConnectToHost), .noAnswer),
            (.http(500, body: "{}"), .noAnswer),
            (.http(502, body: "Bad Gateway"), .noAnswer),
            // A Wi-Fi login page: not Kapelka's answer
            (.http(200, body: "<html>login</html>"), .noAnswer),
            (.http(429, body: ServerReply.rateLimited, headers: ["Retry-After": "120"]), .busy),
        ]
    )
    func reasonOfTheAttempt(reply: FakeTransport.Reply, wait: QueueWait) async throws {
        let harness = try QueueHarness(transport: FakeTransport([reply]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()

        #expect(await queue.state().wait == wait)
        #expect(try harness.store.load().wait == wait)
    }

    @Test("ответ сервера — записал или отказал — снимает причину")
    func answerClearsTheReason() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .failure(.notConnectedToInternet),
            .http(200),
            .failure(.timedOut),
            .http(400, body: ServerReply.textTooLong),
        ]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()
        #expect(await queue.state().wait == .offline)

        await queue.flush()
        #expect(await queue.state().wait == nil)

        _ = try await queue.add("такси 18к")
        await queue.flush()
        #expect(await queue.state().wait == .noAnswer)
        await queue.flush()
        #expect(await queue.state().wait == nil)
        #expect(try harness.store.load().wait == nil)
    }

    @Test("токен не принят, новые настройки — прежней причины нет")
    func tokenAndSettingsClearTheReason() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .failure(.notConnectedToInternet),
            .http(401, body: ServerReply.invalidToken),
            .failure(.timedOut),
        ]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()
        #expect(await queue.state().wait == .offline)

        // The server answered: it is reachable, the token is the reason now
        await queue.flush()
        #expect(await queue.state().tokenRefused)
        #expect(await queue.state().wait == nil)

        await queue.settingsChanged()
        await queue.flush()
        #expect(await queue.state().wait == .noAnswer)
        // New address or token: what the old ones met says nothing about the next attempt
        await queue.settingsChanged()
        #expect(await queue.state().wait == nil)
        #expect(try harness.store.load().wait == nil)
    }

    @Test("удалена последняя ждущая — причины нет; другая ещё ждёт — причина остаётся")
    func removingTheLastWaiting() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let queue = harness.makeQueue()
        let first = try await queue.add("кофе 25к")
        let second = try await queue.add("такси 18к")
        await queue.flush()
        #expect(await queue.state().wait == .offline)

        #expect(try await queue.remove(second.clientId))
        #expect(await queue.state().wait == .offline)
        #expect(try await queue.remove(first.clientId))
        #expect(await queue.state().wait == nil)
        #expect(try harness.store.load().wait == nil)
    }

    @Test("переживает перезапуск; файл до FT-252 без причины читается")
    func keptOnDisk() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.timedOut)]))
        let queue = harness.makeQueue()
        _ = try await queue.add("кофе 25к")
        await queue.flush()

        #expect(await harness.makeQueue().state().wait == .noAnswer)

        let old = #"{"captures":[],"tokenRefused":false}"#
        let state = try JSONDecoder().decode(QueueState.self, from: Data(old.utf8))
        #expect(state.wait == nil)
    }
}
