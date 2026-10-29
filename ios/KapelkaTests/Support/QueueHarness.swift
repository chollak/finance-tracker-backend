import Foundation
@testable import Kapelka

/// A clock the test moves by hand.
final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date

    /// 2026-10-29 09:32:05 UTC — 14:32:05 in Tashkent.
    init(_ start: Date = Date(timeIntervalSince1970: 1_793_266_325)) {
        current = start
    }

    var now: Date { lock.withLock { current } }

    func advance(by seconds: TimeInterval) {
        lock.withLock { current = current.addingTimeInterval(seconds) }
    }
}

/// Server address and token the test can change while the queue runs.
final class TestSettings: @unchecked Sendable {
    static let token = "test-token-0123456789abcdef0123456789abcdef"
    static let address = URL(string: "https://kapelka-pc.example-tailnet.ts.net")!

    private let lock = NSLock()
    private var current: ServerConfiguration?

    init(configured: Bool = true) {
        current = configured ? ServerConfiguration(baseURL: Self.address, token: Self.token) : nil
    }

    var configuration: ServerConfiguration? { lock.withLock { current } }

    func set(_ configuration: ServerConfiguration?) {
        lock.withLock { current = configuration }
    }
}

/// One queue file in its own temporary folder. `makeQueue()` again over the same file is the app started anew —
/// after it was killed or the phone restarted.
struct QueueHarness {
    let store: CaptureFileStore
    let clock: TestClock
    let transport: FakeTransport
    let settings: TestSettings
    let timeZone: TimeZone

    init(
        transport: FakeTransport = FakeTransport(),
        settings: TestSettings = TestSettings(),
        timeZone: TimeZone = TimeZone(identifier: "Asia/Tashkent")!
    ) throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "ft177-queue-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        store = CaptureFileStore(fileURL: directory.appending(path: "captures.json"))
        clock = TestClock()
        self.transport = transport
        self.settings = settings
        self.timeZone = timeZone
    }

    var client: CaptureClient {
        let settings = settings
        return CaptureClient(configuration: { settings.configuration }, transport: transport)
    }

    func makeQueue() -> CaptureQueue {
        let clock = clock
        let timeZone = timeZone
        return CaptureQueue(store: store, sender: client, now: { clock.now }, timeZone: { timeZone })
    }
}

/// Waits until `condition` holds, for work the test starts but does not await itself.
func eventually(
    timeout: Duration = .seconds(3),
    _ condition: @Sendable () async throws -> Bool
) async rethrows -> Bool {
    let deadline = ContinuousClock.now.advanced(by: timeout)
    while ContinuousClock.now < deadline {
        if try await condition() { return true }
        try? await Task.sleep(for: .milliseconds(10))
    }
    return try await condition()
}
