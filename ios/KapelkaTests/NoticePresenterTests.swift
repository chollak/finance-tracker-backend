import Foundation
import Testing
import UserNotifications
@testable import Kapelka

/// The delegate of `UNUserNotificationCenter` answers iOS on the main thread (review of PR #170). A nonisolated `async`
/// delegate method returns on a background thread of the cooperative pool, and iOS calls UIKit from its completion
/// handler there: a tap on a notification crashed the app (SIGABRT in
/// `-[UIApplication _performBlockAfterCATransactionCommitSynchronizes:]`) — laid in FT-253, met in FT-254.
@Suite("Уведомления: делегат на главном потоке")
struct NoticePresenterTests {
    /// iOS calls the Objective-C form with a completion handler; it is the form that crashed. The method reads nothing
    /// of the notification, so a plain object stands in for the one iOS has.
    @Test("iOS получает ответ «как показать» на главном потоке — даже если спросила не с него")
    func answersOnMain() async {
        let presenter = await NoticePresenter(feedback: FeedbackEntry(), open: OpenRequest())

        let answer = await withCheckedContinuation { (continuation: CheckedContinuation<(Bool, UNNotificationPresentationOptions), Never>) in
            // Asked from a background thread, as iOS may ask
            Task.detached {
                let delegate: any UNUserNotificationCenterDelegate = presenter
                let notification = Unmanaged<UNNotification>.fromOpaque(Unmanaged.passRetained(NSObject()).toOpaque())
                    .takeRetainedValue()
                delegate.userNotificationCenter?(
                    UNUserNotificationCenter.current(),
                    willPresent: notification
                ) { options in
                    continuation.resume(returning: (Thread.isMainThread, options))
                }
            }
        }

        #expect(answer.0, "the completion handler ran off the main thread")
        // Not on screen in a test: the banner comes
        #expect(answer.1 == [.banner, .list])
    }

    @Test("нажатие ставит запрос перехода — место и запись — тем же главным актором, что и экран")
    @MainActor
    func tapAsksToOpen() {
        let open = OpenRequest()
        let presenter = NoticePresenter(feedback: FeedbackEntry(), open: open)

        presenter.opened(userInfo: Notice(id: "x", body: "Записал: ужин", opens: .records, record: "rec-1").userInfo)
        #expect(open.target == OpenTarget(.records, record: "rec-1"))

        // Someone else's or an old notification names no place: nothing changes
        presenter.opened(userInfo: [:])
        #expect(open.target == OpenTarget(.records, record: "rec-1"))
    }
}
