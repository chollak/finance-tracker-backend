import Foundation
import Testing
@testable import Kapelka

/// The whole path of FT-253 through the real queue, the entry and the notices: a pass off screen, «Записать оплату»,
/// «Отправить очередь», the token, the background's own deadline.
@MainActor
@Suite("Уведомления: путь через очередь")
struct BackgroundNoticeFlowTests {
    private static let korzinka = PaymentInput(amount: "25 000,00 UZS", merchant: "KORZINKA 24", card: "TBC Uzbekistan")

    private let defaults = TestDefaults()

    private struct Rig {
        let harness: QueueHarness
        let queue: CaptureQueue
        let center: FakeNoticeCenter
        let entry: FeedbackEntry
        let background: BackgroundSend
        let recorder: PaymentRecorder
    }

    private func rig(_ replies: [FakeTransport.Reply]) throws -> Rig {
        let harness = try QueueHarness(transport: FakeTransport(replies))
        let center = FakeNoticeCenter()
        let entry = FeedbackEntry(notices: BackgroundNotices(center: center, memory: NoticeMemory(defaults: defaults.defaults)))
        let queue = harness.makeQueue(onPass: { await entry.queuePassed($0) })
        let clock = harness.clock
        let background = BackgroundSend(
            queue: queue,
            scheduler: FakeRefreshScheduler(),
            now: { clock.now },
            budget: .milliseconds(300)
        )
        let recorder = PaymentRecorder(
            queue: queue,
            cards: CardAccountStore(defaults: defaults.defaults),
            send: { await background.run() },
            isConfigured: { true },
            notify: { await center.add($0) }
        )
        return Rig(harness: harness, queue: queue, center: center, entry: entry, background: background, recorder: recorder)
    }

    private func clientIds(_ rig: Rig) throws -> [String] {
        try rig.harness.store.load().captures.map(\.clientId.uuidString)
    }

    @Test("проход вне экрана с оплатой и двумя фразами — уведомление оплаты и одно общее")
    func paymentAndPhrases() async throws {
        let rig = try rig([
            .http(200, body: CaptureReplyBodies.coffee),
            .http(200, body: CaptureReplyBodies.paymentFromDocs),
            .http(200, body: CaptureReplyBodies.taxiFromDocs),
        ])
        try await rig.queue.add("кофе 45")
        try await rig.queue.addPayment(Self.korzinka)
        try await rig.queue.add("такси 18к")

        await rig.queue.flush()

        let ids = try clientIds(rig)
        #expect(await rig.center.added.map(\.id) == [ids[1], "wrote-\(ids[0])"])
        #expect(await rig.center.texts == [
            "Записал: KORZINKA 24 · Продукты? · \u{2212}25\u{00A0}000\u{00A0}сум",
            "Записал 2 записи",
        ])
    }

    @Test("оплата онлайн — одно уведомление, от прохода; команда своего не шлёт")
    func paymentOnline() async throws {
        let rig = try rig([.http(200, body: CaptureReplyBodies.paymentFromDocs)])

        try await rig.recorder.record(Self.korzinka)

        #expect(await rig.center.added.map(\.id) == (try clientIds(rig)))
        #expect(await rig.center.texts == ["Записал: KORZINKA 24 · Продукты? · \u{2212}25\u{00A0}000\u{00A0}сум"])
    }

    @Test("оплату отклонил сервер — одно уведомление «Не записал: …», переход на «Записать»")
    func paymentRefusedByServer() async throws {
        let rig = try rig([.http(400, body: ServerReply.paymentAmountRefused)])

        try await rig.recorder.record(Self.korzinka)

        #expect(await rig.center.texts == ["Не записал: KORZINKA 24 · 25 000,00 UZS\nСервер не понял сумму"])
        #expect(await rig.center.added.map(\.opens) == [.capture])
    }

    @Test("оплата без связи — «уйдёт позже»; ушла позже в фоне — «Записал: …» на месте прежнего, тот же id")
    func latePaymentReplacesItsNotice() async throws {
        let rig = try rig([.failure(.notConnectedToInternet), .http(200, body: CaptureReplyBodies.paymentFromDocs)])

        try await rig.recorder.record(Self.korzinka)
        let id = try #require(try clientIds(rig).first)
        #expect(await rig.center.delivered == [Notice(id: id, body: "KORZINKA 24 · 25 000,00 UZS — нет связи, уйдёт позже", opens: .capture)])

        await rig.background.run()

        #expect(await rig.center.delivered == [Notice(
            id: id,
            body: "Записал: KORZINKA 24 · Продукты? · \u{2212}25\u{00A0}000\u{00A0}сум",
            opens: .records
        )])
    }

    @Test("оплата ушла при открытом приложении — вибрация «успех», «уйдёт позже» снято, нового уведомления нет")
    func latePaymentOnScreen() async throws {
        let rig = try rig([.failure(.notConnectedToInternet), .http(200, body: CaptureReplyBodies.paymentFromDocs)])
        try await rig.recorder.record(Self.korzinka)
        rig.entry.screenChanged(isActive: true)

        await rig.queue.flush()

        #expect(rig.entry.pulse?.haptic == .success)
        #expect(await rig.center.delivered.isEmpty)
        #expect(await rig.center.added.count == 1)
    }

    @Test("«Отправить очередь» — без уведомлений, ранее доставленное «уйдёт позже» снимается")
    func sendQueueIsQuiet() async throws {
        let rig = try rig([
            .failure(.notConnectedToInternet),
            .http(200, body: CaptureReplyBodies.paymentFromDocs),
            .http(200, body: CaptureReplyBodies.coffee),
        ])
        try await rig.recorder.record(Self.korzinka)
        try await rig.queue.add("кофе 45")

        await rig.entry.quietly { [background = rig.background] in await background.run() }

        #expect(try rig.harness.store.load().captures.map(\.state) == [.sent, .sent])
        #expect(await rig.center.added.count == 1)
        #expect(await rig.center.delivered.isEmpty)
    }

    @Test("токен не принят: одно уведомление; новая оплата — без второго; новые настройки — снято")
    func tokenNotice() async throws {
        let rig = try rig([.http(401, body: ServerReply.invalidToken)])
        try await rig.queue.add("кофе 45")
        await rig.queue.flush()

        try await rig.recorder.record(Self.korzinka)

        let payment = try #require(try clientIds(rig).last)
        #expect(await rig.center.added.map(\.id) == [NoticeText.tokenId, payment])
        #expect(await rig.center.added.map(\.opens) == [.settings, .settings])

        await rig.queue.settingsChanged()
        await rig.entry.settingsChanged()

        #expect(await rig.center.delivered.map(\.id) == [payment])
    }

    @Test("срок фона вышел на спящем ПК: записанное до него — уведомление, хотя проход отменён")
    func deadlineKeepsWhatWasWritten() async throws {
        let rig = try rig([.http(200, body: CaptureReplyBodies.coffee), .hang])
        try await rig.queue.add("кофе 45")
        try await rig.queue.add("такси 18к")

        await rig.background.run()

        #expect(try rig.harness.store.load().captures.map(\.state) == [.sent, .pending])
        #expect(await rig.center.texts == ["Записал: кофе · Кафе · \u{2212}45\u{00A0}000\u{00A0}сум"])
        #expect(await rig.center.droppedOnCancel == 0)
    }
}
