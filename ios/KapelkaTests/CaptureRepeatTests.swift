import Foundation
import Testing
@testable import Kapelka

/// A repeat of a `clientId` (FT-106) is answered from the database, which keeps neither the account's name nor the
/// assumptions: what the first answer said of them stays (FT-255).
@Suite("Повтор не затирает догадки")
struct CaptureRepeatTests {
    private static let first = CaptureReply(
        status: "needs_review",
        title: "Нужно проверить",
        summary: "Кофе · 45 000 сум · Кафе?",
        records: [
            CapturedRecord(
                id: "rec-coffee", type: .expense, amountMinor: 4_500_000, currency: "UZS", category: "Кафе",
                accountName: "Карта", needsReview: true,
                assumptions: [.thousands(written: "45", amount: 45_000), .category(name: "Кафе")]
            ),
        ],
        withoutAmount: [CapturedWithoutAmount(description: "такси", category: "Транспорт")]
    )

    /// What the server answers a repeat with: the record as the database has it now — renamed, «проверить» taken off.
    private static let repeated = CaptureReply(
        status: "saved",
        title: "Записал",
        summary: "Кофе · 45 000 сум · Кофейни",
        records: [
            CapturedRecord(
                id: "rec-coffee", type: .expense, amountMinor: 4_500_000, currency: "UZS", category: "Кофейни",
                accountName: nil, needsReview: false, assumptions: []
            ),
        ],
        repeated: true
    )

    @Test("повтор без догадок и счёта — прежние остаются; остальное — как в базе сейчас")
    func keepsAssumptions() {
        let merged = Self.repeated.merged(over: Self.first)

        #expect(merged == CaptureReply(
            status: "saved",
            title: "Записал",
            summary: "Кофе · 45 000 сум · Кофейни",
            records: [
                CapturedRecord(
                    id: "rec-coffee", type: .expense, amountMinor: 4_500_000, currency: "UZS", category: "Кофейни",
                    accountName: "Карта", needsReview: false,
                    assumptions: [.thousands(written: "45", amount: 45_000), .category(name: "Кафе")]
                ),
            ],
            withoutAmount: [CapturedWithoutAmount(description: "такси", category: "Транспорт")],
            repeated: true
        ))
    }

    @Test("повтор, пока первый запрос ещё пишется, приходит с догадками — берутся его")
    func repeatWithItsOwnAssumptions() {
        let joined = CaptureReply(
            status: "saved", title: "Записал", summary: "Кофе · 45 000 сум",
            records: [
                CapturedRecord(
                    id: "rec-coffee", type: .expense, amountMinor: 4_500_000, currency: "UZS", category: "Кафе",
                    accountName: "Наличные", needsReview: false,
                    assumptions: [.account(name: "Наличные", reason: .hint)]
                ),
            ],
            repeated: true
        )
        #expect(joined.merged(over: Self.first).records == joined.records)
    }

    @Test("прежнего ответа нет или в нём нет этой записи — повтор как есть")
    func nothingToKeep() {
        #expect(Self.repeated.merged(over: nil) == Self.repeated)
        let olderBuild = CaptureReply(
            status: "needs_review", title: "Нужно проверить", summary: "Кофе · 45 000 сум · Кафе?"
        )
        #expect(Self.repeated.merged(over: olderBuild) == Self.repeated)
    }

    @Test("не повтор — ответ сервера целиком: пустые догадки значат «догадок нет»")
    func freshAnswerReplaces() {
        let fresh = CaptureReply(
            status: "saved", title: "Записал", summary: "Кофе · 45 000 сум · Кафе",
            records: [
                CapturedRecord(
                    id: "rec-coffee", type: .expense, amountMinor: 4_500_000, currency: "UZS", category: "Кафе",
                    accountName: "Карта", needsReview: false, assumptions: []
                ),
            ]
        )
        #expect(fresh.merged(over: Self.first) == fresh)
    }

    @Test("очередь: запись с прежним ответом уходит снова с тем же clientId — догадки и счёт после повтора на месте")
    func queueKeepsAssumptionsOnRepeat() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(200, body: CaptureReplyBodies.coffeeRepeated)]))
        var capture = Capture(
            clientId: CaptureReplyBodies.coffeeClientId,
            text: "кофе 45",
            capturedAt: harness.clock.now,
            timeZoneIdentifier: "Asia/Tashkent"
        )
        capture.reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffee)
        var state = QueueState()
        state.captures = [capture]
        try harness.store.save(state)

        let queue = harness.makeQueue()
        await queue.flush()

        let reply = try #require(try harness.store.load().captures.first?.reply)
        #expect(await harness.transport.requests.count == 1)
        #expect(reply.repeated)
        #expect(reply.records.first?.accountName == "Карта")
        #expect(reply.records.first?.assumptions == [
            .thousands(written: "45", amount: 45_000),
            .account(name: "Карта", reason: .byDefault),
        ])
    }
}
