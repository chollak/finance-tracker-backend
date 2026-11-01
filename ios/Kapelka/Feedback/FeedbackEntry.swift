import Foundation
import Observation

/// The notifications half of the entry (FT-253 fills it): what a pass of the queue did while the app was not on
/// screen. The queue waits for `post`, so a background refresh, the half minute after leaving the screen and the
/// commands end only after it: iOS may suspend the app right then. `post` must not wait for the queue's sending —
/// the sending waits for it; reading `CaptureQueue.state()` is fine.
protocol QueueNotices: Sendable {
    func post(_ events: [QueueEvent]) async
}

/// Until FT-253: nothing is posted here. A payment still gets its own notification from `PaymentRecorder` (FT-179).
struct NoQueueNotices: QueueNotices {
    func post(_ events: [QueueEvent]) async {}
}

/// One haptic to play; new for each, so the same haptic twice in a row plays twice.
struct HapticPulse: Equatable, Sendable {
    let number: Int
    let haptic: Haptic
}

/// The one entry for everything the phone answers (FT-251). The queue reports each pass here (`CaptureQueue.onPass`),
/// the microphone and «Записи» their own events. On screen (`scenePhase == .active`) it plays a haptic — the root
/// view's `sensoryFeedback` reads `pulse`; off screen a pass goes to the notifications (`QueueNotices`). It lives in
/// `AppServices`, not in `AppModel`: App Intents send too — «Записать оплату», «Отправить очередь».
@MainActor
@Observable
final class FeedbackEntry {
    /// The last haptic chosen; the screen plays it.
    private(set) var pulse: HapticPulse?
    /// `scenePhase == .active`; an app launched for a command has no screen.
    @ObservationIgnored private(set) var isOnScreen = false

    @ObservationIgnored private let notices: any QueueNotices
    @ObservationIgnored private var played = 0

    /// Not on the main actor: `AppServices.shared` is built by whoever asks first — a command too.
    nonisolated init(notices: any QueueNotices = NoQueueNotices()) {
        self.notices = notices
    }

    func screenChanged(isActive: Bool) {
        isOnScreen = isActive
    }

    /// A pass of the queue. Off screen it returns once the notices are posted.
    func queuePassed(_ events: [QueueEvent]) async {
        switch FeedbackChoice.response(to: .queue(events), onScreen: isOnScreen) {
        case let .haptic(haptic): play(haptic)
        case let .notices(events): await notices.post(events)
        case .nothing: break
        }
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
