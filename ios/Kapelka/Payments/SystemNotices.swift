import UserNotifications

/// Kapelka's notifications through iOS (FT-179). Permission is asked once, when the app is opened, never during a
/// payment; refused, iOS drops the notification and the payment is still written, silently.
enum SystemNotices {
    /// Shows the iOS question the first time only; later calls get the answer already given.
    static func askOnce() async {
        // A failure here only means no notifications: nothing to tell the user beyond what iOS does
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert])
    }

    /// A banner that goes away by itself: no sound, nothing to tap.
    static func post(_ id: UUID, _ text: String) async {
        let content = UNMutableNotificationContent()
        content.body = text
        content.threadIdentifier = "payments"
        let request = UNNotificationRequest(identifier: id.uuidString, content: content, trigger: nil)
        // Without permission iOS refuses it; the payment is on the phone already, so the command still succeeds
        try? await UNUserNotificationCenter.current().add(request)
    }
}

/// While Kapelka is open iOS shows a notification only if asked: a payment's shows there too.
final class NoticePresenter: NSObject, UNUserNotificationCenterDelegate, Sendable {
    static let shared = NoticePresenter()

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list]
    }
}
