import Foundation
import Testing
@testable import Kapelka

/// «Записи» know a record written from this phone by its `clientId` and find the queue's answer for it (FT-255): the
/// way to «Что я предположил» (FT-254) and to the card's records (FT-252).
@Suite("Запись истории находит ответ очереди")
struct RecordQueueAnswerTests {
    private static let phraseId = UUID(uuidString: "3903229C-4ACB-4547-8620-13DC3B9FAA9E")!

    @Test("запись истории с сервера читает clientId; старая и без него — nil")
    func readsClientId() throws {
        let record = try JSONDecoder().decode(Record.self, from: Data(CaptureReplyBodies.coffeeInHistory.utf8))
        #expect(record.clientId == "11111111-2222-4333-8444-555555555502")
        #expect(record.captureClientId == CaptureReplyBodies.coffeeClientId)

        let without = try JSONDecoder().decode(Record.self, from: Data(RecordsReply.record().utf8))
        #expect(without.clientId == nil)
        #expect(without.captureClientId == nil)
    }

    @Test(
        "clientId записи: фраза, её вторая запись, буквы любого регистра",
        arguments: [
            "3903229c-4acb-4547-8620-13dc3b9faa9e",
            "3903229c-4acb-4547-8620-13dc3b9faa9e:1",
            "3903229C-4ACB-4547-8620-13DC3B9FAA9E:12",
        ]
    )
    func captureClientIdOfPhrase(clientId: String) throws {
        #expect(try record("rec", clientId: clientId).captureClientId == Self.phraseId)
    }

    @Test("clientId не с телефона — не UUID очереди", arguments: ["tg-597843119-42", "", ":1", "3903229c-4acb:1"])
    func foreignClientId(clientId: String) throws {
        #expect(try record("rec", clientId: clientId).captureClientId == nil)
    }

    @Test("обе записи фразы находят свой ответ по clientId и id")
    func findsEachRecord() throws {
        let state = try queueState(Self.phraseId, CaptureReplyBodies.coffeeAndHeadphones)

        let coffee = try record("rec-coffee", clientId: "3903229c-4acb-4547-8620-13dc3b9faa9e")
        let headphones = try record("rec-headphones", clientId: "3903229c-4acb-4547-8620-13dc3b9faa9e:1")

        #expect(state.answer(for: coffee)?.id == "rec-coffee")
        let dollars = CaptureAssumption.currency(code: "USD", reason: .noUsdAccount)
        #expect(state.answer(for: headphones)?.assumptions.contains(dollars) == true)
    }

    @Test("ответа нет: запись не с телефона, без clientId, чужой id, ответ старой сборки")
    func noAnswer() throws {
        let state = try queueState(Self.phraseId, CaptureReplyBodies.coffeeAndHeadphones)

        #expect(state.answer(for: try record("rec-coffee", clientId: nil)) == nil)
        #expect(state.answer(for: try record("rec-coffee", clientId: UUID().uuidString.lowercased())) == nil)
        #expect(state.answer(for: try record("rec-other", clientId: "3903229c-4acb-4547-8620-13dc3b9faa9e:2")) == nil)

        var older = QueueState()
        var capture = Capture(
            clientId: Self.phraseId, text: "кофе", capturedAt: Date(), timeZoneIdentifier: "Asia/Tashkent"
        )
        capture.state = .sent
        capture.reply = CaptureReply(status: "saved", title: "Записал", summary: "Кофе · 25 000 сум")
        older.captures = [capture]
        #expect(older.answer(for: try record("rec-coffee", clientId: "3903229c-4acb-4547-8620-13dc3b9faa9e")) == nil)
    }

    @Test("фраза с телефона → ответ сервера → та же запись в «Записях» находит его")
    func endToEnd() async throws {
        let harness = try QueueHarness(transport: FakeTransport([.http(200, body: CaptureReplyBodies.coffee)]))
        let queue = harness.makeQueue()
        let capture = try await queue.add("кофе 45")
        await queue.flush()

        // The server stores the clientId as the phone sent it, in lower case
        let sentClientId = try #require(try await harness.transport.sentClientIds().first)
        let inHistory = try record(CaptureReplyBodies.coffeeId, clientId: sentClientId)
        let answer = try #require(await queue.state().answer(for: inHistory))

        #expect(inHistory.captureClientId == capture.clientId)
        #expect(answer.assumptions.first == .thousands(written: "45", amount: 45_000))
    }

    @Test("ответ хранит категорию и счёт записи по id: после смены категории в «Записях» они расходятся")
    func answerKeepsIdsToCompare() throws {
        let clientId = CaptureReplyBodies.coffeeClientId.uuidString.lowercased()
        let state = try queueState(CaptureReplyBodies.coffeeClientId, CaptureReplyBodies.coffee)
        let asWritten = try record(
            CaptureReplyBodies.coffeeId, clientId: clientId,
            categoryId: "637c7a38-2079-4094-a0dd-c40c5d36c211", accountId: "26da76bc-f575-46c8-74d7-8ffd3e562694"
        )
        let recategorised = try record(
            CaptureReplyBodies.coffeeId, clientId: clientId,
            categoryId: "cat-groceries", accountId: "26da76bc-f575-46c8-74d7-8ffd3e562694"
        )

        let answer = try #require(state.answer(for: asWritten))
        #expect(answer.categoryId == asWritten.categoryId)
        #expect(answer.accountId == asWritten.accountId)
        #expect(state.answer(for: recategorised)?.categoryId != recategorised.categoryId)
    }

    private func record(
        _ id: String,
        clientId: String?,
        categoryId: String = "cat-cafe",
        accountId: String? = "acc-card"
    ) throws -> Record {
        let json = RecordsReply.record(id: id, categoryId: categoryId, accountId: accountId, clientId: clientId)
        return try JSONDecoder().decode(Record.self, from: Data(json.utf8))
    }

    private func queueState(_ clientId: UUID, _ body: String) throws -> QueueState {
        var state = QueueState()
        state.captures = [try CaptureReplyBodies.sentCapture(clientId, text: "фраза", body: body)]
        return state
    }
}
