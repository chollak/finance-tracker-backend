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

/// The wait for a 429 pause to end, as the test sees it: by default it never ends, so a test sees only the sends it
/// starts itself; `passes` moves the test clock past the pause at once.
final class TestRetryWait: @unchecked Sendable {
    private let lock = NSLock()
    private var asked: [TimeInterval] = []
    private let clock: TestClock?

    private init(clock: TestClock?) {
        self.clock = clock
    }

    static let never = TestRetryWait(clock: nil)

    static func passes(_ clock: TestClock) -> TestRetryWait {
        TestRetryWait(clock: clock)
    }

    /// Every pause the queue waited for, in seconds.
    var waits: [TimeInterval] { lock.withLock { asked } }

    func wait(_ seconds: TimeInterval) async throws {
        lock.withLock { asked.append(seconds) }
        guard let clock else {
            try await Task.sleep(for: .seconds(3600))
            return
        }
        clock.advance(by: seconds)
    }
}

/// Folders of this test run. One left by an earlier run — a test that stopped halfway — goes when the next run starts.
enum TestFolders {
    private static let prefix = "kapelka-tests-"

    static let root: URL = {
        let temporary = FileManager.default.temporaryDirectory
        let names = (try? FileManager.default.contentsOfDirectory(atPath: temporary.path())) ?? []
        for name in names where name.hasPrefix(prefix) || name.hasPrefix("ft177-queue-") {
            try? FileManager.default.removeItem(at: temporary.appending(path: name))
        }
        return temporary.appending(path: "\(prefix)\(UUID().uuidString)", directoryHint: .isDirectory)
    }()

    static func make() throws -> URL {
        let folder = root.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }
}

/// One queue file in its own temporary folder, removed with the harness. `makeQueue()` again over the same file is
/// the app started anew — after it was killed or the phone restarted.
final class QueueHarness: Sendable {
    let store: CaptureFileStore
    let clock: TestClock
    let transport: FakeTransport
    let settings: TestSettings
    let timeZone: TimeZone
    let retryWait: TestRetryWait

    init(
        transport: FakeTransport = FakeTransport(),
        settings: TestSettings = TestSettings(),
        timeZone: TimeZone = TimeZone(identifier: "Asia/Tashkent")!,
        retryWait: ((TestClock) -> TestRetryWait)? = nil
    ) throws {
        store = CaptureFileStore(fileURL: try TestFolders.make().appending(path: "captures.json"))
        clock = TestClock()
        self.transport = transport
        self.settings = settings
        self.timeZone = timeZone
        self.retryWait = retryWait?(clock) ?? .never
    }

    deinit {
        try? FileManager.default.removeItem(at: store.fileURL.deletingLastPathComponent())
    }

    var client: CaptureClient {
        let settings = settings
        return CaptureClient(configuration: { settings.configuration }, transport: transport)
    }

    func makeQueue(retryWait: TestRetryWait? = nil) -> CaptureQueue {
        let clock = clock
        let timeZone = timeZone
        let retryWait = retryWait ?? self.retryWait
        return CaptureQueue(
            store: store,
            sender: client,
            now: { clock.now },
            timeZone: { timeZone },
            waitForRetry: { try await retryWait.wait($0) }
        )
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
