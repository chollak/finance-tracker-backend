import UserNotifications

/// Kapelka's notifications through iOS (FT-179, FT-253). Permission is asked once, when the app is opened, never during
/// a payment; refused, iOS drops the notification and the record is written all the same, silently.
enum SystemNotices {
    /// Shows the iOS question the first time only; later calls get the answer already given.
    static func askOnce() async {
        // A failure here only means no notifications: nothing to tell the user beyond what iOS does
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert])
    }
}

/// `UNUserNotificationCenter` itself: no sound, one group «Kapelka», and where a tap opens in `userInfo`. Amounts on the
/// lock screen are hidden by the system's «Показ миниатюр», not by the app.
struct SystemNoticeCenter: NoticeCenter {
    static let thread = "kapelka"

    func add(_ notice: Notice) async {
        let content = UNMutableNotificationContent()
        content.body = notice.body
        content.threadIdentifier = Self.thread
        content.userInfo = notice.userInfo
        let request = UNNotificationRequest(identifier: notice.id, content: content, trigger: nil)
        // Without permission iOS refuses it; the record is on the phone already, so nothing else fails
        try? await UNUserNotificationCenter.current().add(request)
    }

    func remove(_ ids: [String]) async {
        let center = UNUserNotificationCenter.current()
        center.removeDeliveredNotifications(withIdentifiers: ids)
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }
}

/// While Kapelka is open iOS shows a notification only if asked (FT-253): on screen the haptic answers, so nothing is
/// shown; `.inactive` — the Wallet sheet, the notification shade over the app — is off screen, and the banner comes.
/// A tap opens the place the notification names.
final class NoticePresenter: NSObject, UNUserNotificationCenterDelegate, Sendable {
    @MainActor static let shared = NoticePresenter(feedback: AppServices.shared.feedback, open: .shared)

    private let feedback: FeedbackEntry
    private let open: OpenRequest

    init(feedback: FeedbackEntry, open: OpenRequest) {
        self.feedback = feedback
        self.open = open
    }

    static func presentation(onScreen: Bool) -> UNNotificationPresentationOptions {
        onScreen ? [] : [.banner, .list]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        Self.presentation(onScreen: await feedback.isOnScreen)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let target = OpenTarget(userInfo: response.notification.request.content.userInfo) else { return }
        await open.ask(target)
    }
}
