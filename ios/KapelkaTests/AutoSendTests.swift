import Foundation
import Testing
@testable import Kapelka

/// The network path as the test switches it.
final class FakePathWatcher: PathWatching, @unchecked Sendable {
    private let lock = NSLock()
    private var handler: (@Sendable (Bool) -> Void)?

    func start(onChange: @escaping @Sendable (Bool) -> Void) {
        lock.withLock { handler = onChange }
    }

    func emit(satisfied: Bool) {
        lock.withLock { handler }?(satisfied)
    }
}

/// Background refresh requests as the test sees them.
final class FakeRefreshScheduler: RefreshScheduling, @unchecked Sendable {
    enum Call: Equatable {
        case submit(String, Date)
        case cancel(String)
    }

    private let lock = NSLock()
    private var recorded: [Call] = []

    var calls: [Call] { lock.withLock { recorded } }

    func submit(identifier: String, earliestBeginDate: Date) throws {
        lock.withLock { recorded.append(.submit(identifier, earliestBeginDate)) }
    }

    func cancel(identifier: String) {
        lock.withLock { recorded.append(.cancel(identifier)) }
    }
}

@Suite("Очередь уходит сама")
struct AutoSendTests {
    @Test("появилась сеть при открытом приложении — очередь уходит")
    func sendsWhenNetworkAppears() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        for text in ["кофе 25к", "такси 18к", "обед 60к"] {
            try await queue.add(text)
        }
        let watcher = FakePathWatcher()
        AutoSender(watcher: watcher, queue: queue).start()

        watcher.emit(satisfied: false)
        try await Task.sleep(for: .milliseconds(50))
        #expect(await harness.transport.requests.isEmpty)

        watcher.emit(satisfied: true)
        #expect(await eventually { await harness.transport.requests.count == 3 })
        #expect(harness.store.load().captures.map(\.state) == [.sent, .sent, .sent])
    }

    @Test("новая сеть при той же связи (включился Tailscale) — ещё попытка")
    func triesAgainOnEveryNewPath() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.cannotConnectToHost)]))
        let queue = harness.makeQueue()
        try await queue.add("кофе 25к")
        let watcher = FakePathWatcher()
        AutoSender(watcher: watcher, queue: queue).start()

        watcher.emit(satisfied: true)
        #expect(await eventually { await harness.transport.requests.count == 1 })
        watcher.emit(satisfied: true)
        #expect(await eventually { harness.store.load().captures.map(\.state) == [.sent] })
    }
}

@Suite("Отправка в фоне")
struct BackgroundSendTests {
    private func makeBackground(_ harness: QueueHarness, queue: CaptureQueue, scheduler: FakeRefreshScheduler) -> BackgroundSend {
        let clock = harness.clock
        return BackgroundSend(queue: queue, scheduler: scheduler, now: { clock.now })
    }

    @Test("ушло в фон с ждущими — просим iOS разбудить не раньше чем через 15 минут")
    func schedulesWhilePending() async throws {
        let harness = try QueueHarness(settings: TestSettings(configured: false))
        let queue = harness.makeQueue()
        try await queue.add("кофе 25к")
        let scheduler = FakeRefreshScheduler()

        await makeBackground(harness, queue: queue, scheduler: scheduler).schedule()

        #expect(scheduler.calls == [.submit("kapelka.send-queue", harness.clock.now.addingTimeInterval(15 * 60))])
    }

    @Test("ждущих нет — запрос на фон снимается")
    func cancelsWhenNothingWaits() async throws {
        let harness = try QueueHarness()
        let scheduler = FakeRefreshScheduler()

        await makeBackground(harness, queue: harness.makeQueue(), scheduler: scheduler).schedule()

        #expect(scheduler.calls == [.cancel("kapelka.send-queue")])
    }

    @Test("фоновое обновление отправляет очередь; всё ушло — следующее не нужно")
    func refreshSendsQueue() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        try await queue.add("кофе 25к")
        try await queue.add("такси 18к")
        let scheduler = FakeRefreshScheduler()

        await makeBackground(harness, queue: queue, scheduler: scheduler).run()

        #expect(harness.store.load().captures.map(\.state) == [.sent, .sent])
        #expect(scheduler.calls == [.cancel("kapelka.send-queue")])
    }

    @Test("сервер не ответил в фоне — просим следующее обновление")
    func refreshAsksForNextWhenServerDown() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.failure(.cannotConnectToHost)]))
        let queue = harness.makeQueue()
        try await queue.add("кофе 25к")
        let scheduler = FakeRefreshScheduler()

        await makeBackground(harness, queue: queue, scheduler: scheduler).run()

        #expect(harness.store.load().captures.map(\.state) == [.pending])
        #expect(scheduler.calls == [.submit("kapelka.send-queue", harness.clock.now.addingTimeInterval(15 * 60))])
    }

    @Test("время фона вышло — отправка прерывается, запись ждёт")
    func expirationStopsSending() async throws {
        let harness = try QueueHarness(transport: FakeTransport(latency: .seconds(10)))
        let queue = harness.makeQueue()
        try await queue.add("кофе 25к")
        let background = makeBackground(harness, queue: queue, scheduler: FakeRefreshScheduler())

        let refresh = Task { await background.run() }
        #expect(await eventually { await harness.transport.requests.count == 1 })
        let started = ContinuousClock.now
        refresh.cancel()
        await refresh.value

        #expect(ContinuousClock.now - started < .seconds(2))
        #expect(harness.store.load().captures.map(\.state) == [.pending])
    }
}
