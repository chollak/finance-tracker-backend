import Foundation
import Testing
@testable import Kapelka

/// The notifications half of the entry (FT-253): what a pass off screen posts, the token's one notice, what the screen
/// takes off, and the time it keeps to.
@Suite("Уведомления: что уходит в центр")
struct BackgroundNoticesTests {
    private static let at = Date(timeIntervalSince1970: 1_793_266_325)

    private let defaults = TestDefaults()

    private func notices(_ center: FakeNoticeCenter, limit: Duration = .seconds(2)) -> BackgroundNotices {
        BackgroundNotices(center: center, memory: NoticeMemory(defaults: defaults.defaults), limit: limit)
    }

    private func coffee() throws -> Capture {
        try CaptureReplyBodies.sentCapture(UUID(), text: "кофе 45", body: CaptureReplyBodies.coffee)
    }

    private func waiting() -> Capture {
        Capture(clientId: UUID(), text: "такси 18к", capturedAt: Self.at, timeZoneIdentifier: "Asia/Tashkent")
    }

    private func payment(_ state: Capture.State) throws -> Capture {
        var capture = Capture(
            clientId: UUID(),
            text: "",
            capturedAt: Self.at,
            timeZoneIdentifier: "Asia/Tashkent",
            payment: Payment(walletAmount: "25 000,00 UZS", amount: "25000.00", currency: "UZS", merchant: "KORZINKA 24", card: nil)
        )
        capture.state = state
        capture.attempts = 1
        if state == .sent {
            capture.reply = try CaptureReplyBodies.reply(CaptureReplyBodies.paymentFromDocs)
        } else {
            capture.rejection = "amount must be a decimal string"
        }
        return capture
    }

    @Test("проход — уведомления в центр, по одному на вид")
    func posts() async throws {
        let center = FakeNoticeCenter()
        let pass: [QueueEvent] = [.wrote([try coffee()]), .queued([waiting()])]

        await notices(center).post(pass)

        #expect(await center.added == NoticeText.notices(for: pass))
        #expect(await center.added.count == 1)
    }

    @Test("токен: одно уведомление; повторный отказ и новая фраза при непринятом токене — без нового")
    func tokenOnce() async throws {
        let center = FakeNoticeCenter()
        let background = notices(center)
        let coffee = try coffee()

        await background.post([.tokenRefused])
        await background.post([.tokenRefused])
        await background.post([.wrote([coffee]), .tokenRefused])

        #expect(await center.added.map(\.id) == [NoticeText.tokenId, "wrote-\(coffee.clientId.uuidString)"])
    }

    @Test("токен: без повторов и после перезапуска — память на диске")
    func tokenOnceAcrossLaunches() async {
        let center = FakeNoticeCenter()

        await notices(center).post([.tokenRefused])
        // The app killed and launched again for a background refresh: a new process, the same defaults
        await notices(center).post([.tokenRefused])

        #expect(await center.added.map(\.id) == [NoticeText.tokenId])
    }

    @Test("новые настройки снимают уведомление о токене; следующий отказ — снова уведомление")
    func settingsTakeTokenNoticeOff() async {
        let center = FakeNoticeCenter()
        let background = notices(center)
        await background.post([.tokenRefused])

        await background.settingsChanged()

        #expect(await center.removed == [NoticeText.tokenId])
        #expect(await center.delivered.isEmpty)

        await background.post([.tokenRefused])
        #expect(await center.added.map(\.id) == [NoticeText.tokenId, NoticeText.tokenId])
    }

    @Test("на экране: снимаются только оплаты, на которые ответил сервер, — их «уйдёт позже»")
    func withdrawPayments() async throws {
        let center = FakeNoticeCenter()
        let written = try payment(.sent)
        let refused = try payment(.rejected)

        await notices(center).withdraw([.wrote([try coffee(), written]), .rejected([refused]), .tokenRefused])

        #expect(await center.removed == [written.clientId.uuidString, refused.clientId.uuidString])
        #expect(await center.added.isEmpty)
    }

    @Test("на экране без оплат — центр не трогается")
    func withdrawNothing() async throws {
        let center = FakeNoticeCenter()

        await notices(center).withdraw([.wrote([try coffee()]), .queued([waiting()])])

        #expect(await center.removed.isEmpty)
    }

    @Test("укладывается в свой срок: центр не отвечает — post возвращается, очередь не стоит")
    func keepsToItsTime() async throws {
        let center = FakeNoticeCenter(addTakes: .seconds(3600))
        let started = ContinuousClock.now

        await notices(center, limit: .milliseconds(100)).post([.wrote([try coffee()])])

        #expect(ContinuousClock.now - started < .seconds(2))
    }

    @Test("отмена не бросает работу: срок фона вышел, а записанное до него — новость")
    func cancelledStillPosts() async throws {
        let center = FakeNoticeCenter()
        let background = notices(center)
        let pass: [QueueEvent] = [.wrote([try coffee()])]

        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            await background.post(pass)
        }
        await task.value

        #expect(await center.added.count == 1)
        #expect(await center.droppedOnCancel == 0)
    }

    @Test("пустой проход и «в очереди» — центр не трогается")
    func nothingToPost() async {
        let center = FakeNoticeCenter()

        await notices(center).post([.queued([waiting()])])

        #expect(await center.added.isEmpty)
    }
}
