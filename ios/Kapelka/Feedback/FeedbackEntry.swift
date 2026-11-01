import Foundation
import Observation

/// The notifications half of the entry (FT-253, `BackgroundNotices`). The queue waits for each call, so a background
/// refresh, the half minute after leaving the screen and the commands end only after it: iOS may suspend the app right
/// then. None may wait for the queue's sending — the sending waits for them; reading `CaptureQueue.state()` is fine.
protocol QueueNotices: Sendable {
    /// What a pass did while the app was not on screen.
    func post(_ events: [QueueEvent]) async
    /// The pass on screen or under «Отправить очередь»: nothing is posted, and a payment the server answered takes its
    /// «уйдёт позже» off.
    func withdraw(_ events: [QueueEvent]) async
    /// New address or token: the token's notice goes.
    func settingsChanged() async
}

/// Nothing is posted: the default for the tests of the haptics.
struct NoQueueNotices: QueueNotices {
    func post(_ events: [QueueEvent]) async {}
    func withdraw(_ events: [QueueEvent]) async {}
    func settingsChanged() async {}
}

/// One haptic to play; new for each, so the same haptic twice in a row plays twice.
struct HapticPulse: Equatable, Sendable {
    let number: Int
    let haptic: Haptic
}

/// The one entry for everything the phone answers (FT-251). The queue reports each pass here (`CaptureQueue.onPass`),
/// the microphone and «Записи» their own events. On screen (`scenePhase == .active`) it plays a haptic — the root
/// view's `sensoryFeedback` reads `pulse`; off screen a pass goes to the notifications (`QueueNotices`, FT-253). It
/// lives in `AppServices`, not in `AppModel`: App Intents send too — «Записать оплату», «Отправить очередь».
@MainActor
@Observable
final class FeedbackEntry {
    /// The last haptic chosen; the screen plays it.
    private(set) var pulse: HapticPulse?
    /// `scenePhase == .active`; an app launched for a command has no screen.
    @ObservationIgnored private(set) var isOnScreen = false

    @ObservationIgnored private let notices: any QueueNotices
    @ObservationIgnored private var played = 0
    /// Runs of «Отправить очередь» going on: it answers with its own dialog, so its passes post nothing.
    @ObservationIgnored private var quiet = 0

    /// Not on the main actor: `AppServices.shared` is built by whoever asks first — a command too.
    nonisolated init(notices: any QueueNotices = NoQueueNotices()) {
        self.notices = notices
    }

    func screenChanged(isActive: Bool) {
        isOnScreen = isActive
    }

    /// A pass of the queue. Off screen it returns once the notices are posted. Passes merge inside `flush`, so the
    /// quiet one is told by `quietly` around the whole send, not by the pass.
    func queuePassed(_ events: [QueueEvent]) async {
        switch FeedbackChoice.response(to: .queue(events), onScreen: isOnScreen) {
        case let .haptic(haptic):
            play(haptic)
            await notices.withdraw(events)
        case let .notices(events) where quiet > 0:
            await notices.withdraw(events)
        case let .notices(events):
            await notices.post(events)
        case .nothing:
            break
        }
    }

    /// «Отправить очередь»: what `work` sends posts no notification — the command answers with its own dialog.
    func quietly<T: Sendable>(_ work: @Sendable () async -> T) async -> T {
        quiet += 1
        defer { quiet -= 1 }
        return await work()
    }

    /// The address or the token changed (`AppModel.saveSettings`).
    func settingsChanged() async {
        await notices.settingsChanged()
    }

    /// The screen's own events: the microphone, an edit of «Записи». Off screen they are no news; a pass of the queue
    /// comes through `queuePassed`.
    func happened(_ event: FeedbackEvent) {
        if case let .haptic(haptic) = FeedbackChoice.response(to: event, onScreen: isOnScreen) {
            play(haptic)
        }
    }

    private func play(_ haptic: Haptic) {
        played += 1
        pulse = HapticPulse(number: played, haptic: haptic)
    }
}
