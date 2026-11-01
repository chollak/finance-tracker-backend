import Foundation

/// The notifications half of the entry (FT-253): what a pass did while the app was not on screen, as `NoticeText` says
/// it, into the notification centre. The queue waits for it, so it keeps to its own time and never waits for the
/// queue's sending — only `NoticeCenter`.
actor BackgroundNotices: QueueNotices {
    /// iOS gives a background refresh and the half minute after leaving the screen about 30 s; the pass may end near
    /// the end of it (`BackgroundSend.budget` — 25 s). Adding a notification takes milliseconds.
    static let defaultLimit: Duration = .seconds(2)

    private let center: any NoticeCenter
    private let memory: NoticeMemory
    private let limit: Duration

    init(center: any NoticeCenter, memory: NoticeMemory, limit: Duration = defaultLimit) {
        self.center = center
        self.memory = memory
        self.limit = limit
    }

    /// Records written before the background's deadline are news all the same: a cancelled pass still posts them.
    func post(_ events: [QueueEvent]) async {
        let notices = NoticeText.notices(for: events).filter(isNews)
        guard !notices.isEmpty else { return }
        await Deadline.finish(within: limit) { [center] in
            for notice in notices {
                await center.add(notice)
            }
        }
    }

    /// One notice for the token, until new settings: a new phrase while it is refused is no new news.
    private func isNews(_ notice: Notice) -> Bool {
        guard notice.id == NoticeText.tokenId else { return true }
        guard !memory.tokenPosted else { return false }
        memory.tokenPosted = true
        return true
    }

    /// The app on screen, or «Отправить очередь»: the payments the server answered take their «уйдёт позже» off.
    func withdraw(_ events: [QueueEvent]) async {
        let ids = NoticeText.answeredPaymentIds(events)
        guard !ids.isEmpty else { return }
        await Deadline.finish(within: limit) { [center] in await center.remove(ids) }
    }

    /// New address or token: the token's notice is taken off, and a new refusal is news again.
    func settingsChanged() async {
        memory.tokenPosted = false
        await Deadline.finish(within: limit) { [center] in await center.remove([NoticeText.tokenId]) }
    }
}

/// What the notices remember between launches: a background refresh is a new process, and the token's notice must
/// not come again in it. The app's `UserDefaults`.
final class NoticeMemory: @unchecked Sendable {
    private static let tokenKey = "notices.tokenPosted"

    // UserDefaults is thread-safe; `BackgroundNotices` reads and writes it on its own actor only
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The token's notice is out, since the last new settings.
    var tokenPosted: Bool {
        get { defaults.bool(forKey: Self.tokenKey) }
        set { defaults.set(newValue, forKey: Self.tokenKey) }
    }
}

enum Deadline {
    /// Runs `work` to its end or for `limit`, whichever comes first. The caller's cancellation does not stop it: the
    /// work runs in a task of its own, and the wait is not a cancellable sleep of the caller.
    static func finish(within limit: Duration, _ work: @escaping @Sendable () async -> Void) async {
        let working = Task { await work() }
        let timer = Task { try? await Task.sleep(for: limit) }
        let first = FirstOf()
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            first.start(continuation)
            Task {
                await working.value
                first.finish()
            }
            Task {
                await timer.value
                first.finish()
            }
        }
        timer.cancel()
    }
}

/// Resumes the wait once, for whichever of the two ends first.
private final class FirstOf: @unchecked Sendable {
    // Guards `continuation`; the two ends race
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Never>?

    func start(_ continuation: CheckedContinuation<Void, Never>) {
        lock.withLock { self.continuation = continuation }
    }

    func finish() {
        let waiting = lock.withLock {
            defer { continuation = nil }
            return continuation
        }
        waiting?.resume()
    }
}
