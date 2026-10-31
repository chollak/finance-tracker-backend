import Foundation
import Testing
@testable import Kapelka

/// The events each pass of the queue reports (FT-251), as the one entry in `AppServices` gets them.
actor PassLog {
    private(set) var passes: [[QueueEvent]] = []
    private var gate: CheckedContinuation<Void, Never>?
    private var holds = false

    /// The next pass waits in `record` until `release()`: the background notices still being posted.
    func hold() {
        holds = true
    }

    func release() {
        holds = false
        gate?.resume()
        gate = nil
    }

    func record(_ events: [QueueEvent]) async {
        passes.append(events)
        if holds {
            await withCheckedContinuation { gate = $0 }
        }
    }
}

@Suite("Проход очереди: одно событие на проход")
struct QueuePassTests {
    private func queue(_ harness: QueueHarness, _ log: PassLog) -> CaptureQueue {
        harness.makeQueue(onPass: { await log.record($0) })
    }

    @Test("три фразы за проход — один вызов с одним «записал» на три записи")
    func batchIsOnePass() async throws {
        let harness = try QueueHarness()
        let log = PassLog()
        let queue = queue(harness, log)
        for text in ["кофе 25к", "такси 18к", "обед 60к"] {
            _ = try await queue.add(text)
        }

        await queue.flush()

        let passes = await log.passes
        #expect(passes.count == 1)
        let written = try harness.store.load().captures
        #expect(passes.first == [.wrote(written)])
    }

    @Test("без сети: первая попытка — «в очереди», следующая неудачная — тишина")
    func offlineQueuedOnce() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .failure(.notConnectedToInternet),
            .failure(.notConnectedToInternet),
        ]))
        let log = PassLog()
        let queue = queue(harness, log)
        let phrase = try await queue.add("кофе 25к")

        await queue.flush()
        await queue.flush()

        let passes = await log.passes
        #expect(passes.count == 1)
        guard case let .queued(waiting)? = passes.first?.first else {
            Issue.record("not «в очереди»: \(passes)")
            return
        }
        // As it was at the end of its pass: after the first attempt
        #expect(waiting.map(\.clientId) == [phrase.clientId])
        #expect(waiting.map(\.attempts) == [1])
    }

    @Test("связь вернулась — «записал»")
    func wroteAfterQueued() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.notConnectedToInternet)]))
        let log = PassLog()
        let queue = queue(harness, log)
        _ = try await queue.add("кофе 25к")

        await queue.flush()
        await queue.flush()

        let passes = await log.passes
        #expect(passes.count == 2)
        #expect(passes.last == [.wrote(try harness.store.load().captures)])
    }

    @Test("токен не принят — одно событие «токен»")
    func tokenRefused() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(401, body: ServerReply.invalidToken)]))
        let log = PassLog()
        let queue = queue(harness, log)
        _ = try await queue.add("кофе 25к")

        await queue.flush()

        #expect(await log.passes == [[.tokenRefused]])
    }

    @Test("отправлять нечего — вызова нет")
    func emptyPassIsSilent() async throws {
        let harness = try QueueHarness()
        let log = PassLog()
        let queue = queue(harness, log)

        await queue.flush()

        #expect(await log.passes.isEmpty)
    }

    @Test("не настроено — попытки нет, вызова нет")
    func notConfiguredIsSilent() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let log = PassLog()
        let queue = queue(harness, log)
        _ = try await queue.add("кофе 25к")

        await queue.flush()

        #expect(await log.passes.isEmpty)
    }

    @Test("отправка кончается после входа: фон не уходит, пока уведомления не отправлены")
    func flushWaitsForTheEntry() async throws {
        let harness = try QueueHarness()
        let log = PassLog()
        await log.hold()
        let queue = queue(harness, log)
        _ = try await queue.add("кофе 25к")
        let flushed = Flag()

        let sending = Task {
            await queue.flush()
            await flushed.set()
        }
        #expect(await eventually { await log.passes.count == 1 })
        try await Task.sleep(for: .milliseconds(50))
        #expect(await !flushed.isSet)

        await log.release()
        await sending.value
        #expect(await flushed.isSet)
    }
}

actor Flag {
    private(set) var isSet = false

    func set() {
        isSet = true
    }
}
