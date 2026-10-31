import Foundation
import Testing
@testable import Kapelka

/// The notices half, as FT-253 will fill it: what reached it.
actor PassNotices: QueueNotices {
    private(set) var posted: [[QueueEvent]] = []

    func post(_ events: [QueueEvent]) async {
        posted.append(events)
    }
}

/// The one entry for everything the phone answers (FT-251): a haptic on screen, the notices off screen.
@MainActor
@Suite("Отклик: общий вход")
struct FeedbackEntryTests {
    private static let at = Date(timeIntervalSince1970: 1_793_266_325)

    private func written() throws -> QueueEvent {
        var capture = Capture(clientId: UUID(), text: "кофе 25к", capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent")
        capture.state = .sent
        capture.attempts = 1
        capture.reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffee)
        return .wrote([capture])
    }

    @Test("на экране проход очереди — вибрация, уведомлений нет")
    func onScreenPlaysHaptic() async throws {
        let notices = PassNotices()
        let entry = FeedbackEntry(notices: notices)
        entry.screenChanged(isActive: true)

        await entry.queuePassed([try written()])

        #expect(entry.pulse?.haptic == .success)
        #expect(await notices.posted.isEmpty)
    }

    @Test("тот же отклик два раза подряд — играет два раза")
    func sameHapticTwice() {
        let entry = FeedbackEntry()
        entry.screenChanged(isActive: true)

        entry.happened(.editSaved)
        let first = entry.pulse
        entry.happened(.editSaved)

        #expect(first?.haptic == .success)
        #expect(entry.pulse?.haptic == .success)
        #expect(entry.pulse != first)
    }

    @Test("не на экране — вибрации нет, проход уходит в уведомления, и вход ждёт их")
    func offScreenPostsNotices() async throws {
        let notices = PassNotices()
        let entry = FeedbackEntry(notices: notices)
        let pass = [try written(), .tokenRefused]

        await entry.queuePassed(pass)

        #expect(entry.pulse == nil)
        #expect(await notices.posted == [pass])
    }

    @Test("ушёл с экрана — отклик идёт в уведомления; вернулся — снова вибрация")
    func followsScenePhase() async throws {
        let notices = PassNotices()
        let entry = FeedbackEntry(notices: notices)
        entry.screenChanged(isActive: true)
        entry.screenChanged(isActive: false)

        await entry.queuePassed([try written()])
        #expect(entry.pulse == nil)
        #expect(await notices.posted.count == 1)

        entry.screenChanged(isActive: true)
        await entry.queuePassed([try written()])
        #expect(entry.pulse?.haptic == .success)
        #expect(await notices.posted.count == 1)
    }

    @Test("микрофон и правки не на экране — ничего")
    func offScreenScreenEvents() async {
        let notices = PassNotices()
        let entry = FeedbackEntry(notices: notices)

        entry.happened(.listening)
        entry.happened(.editFailed)

        #expect(entry.pulse == nil)
        #expect(await notices.posted.isEmpty)
    }

    @Test("пачка через настоящую очередь на экране — одна вибрация")
    func batchThroughQueueIsOnePulse() async throws {
        let entry = FeedbackEntry()
        entry.screenChanged(isActive: true)
        let harness = try QueueHarness()
        let queue = harness.makeQueue(onPass: { await entry.queuePassed($0) })
        for text in ["кофе 25к", "такси 18к", "обед 60к"] {
            _ = try await queue.add(text)
        }

        await queue.flush()

        #expect(entry.pulse == HapticPulse(number: 1, haptic: .success))
    }
}
