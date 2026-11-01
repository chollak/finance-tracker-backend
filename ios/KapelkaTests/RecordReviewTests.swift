import Foundation
import Testing
@testable import Kapelka

/// «!» explains itself (FT-254): what the parse took for granted, from the answer the queue kept (FT-255) — only while
/// the record is as the server wrote it. Edited since, written elsewhere, a repeat without assumptions — the general
/// phrase: the guesses may be stale or were never kept.
@Suite("Записи: почему «!»")
struct RecordReviewTests {
    private func record(
        categoryId: String = "cat-shopping",
        category: String = "Покупки",
        amountMinor: Int = 5_500,
        currency: String = "USD",
        accountId: String? = "acc-card"
    ) throws -> Record {
        let json = RecordsReply.record(
            id: "rec-headphones", amountMinor: amountMinor, currency: currency, categoryId: categoryId,
            category: category, description: "наушники", needsReview: true, accountId: accountId
        )
        return try JSONDecoder().decode(Record.self, from: Data(json.utf8))
    }

    private func answer(
        categoryId: String? = "cat-shopping",
        amountMinor: Int = 5_500,
        currency: String = "USD",
        accountId: String? = "acc-card",
        assumptions: [CaptureAssumption] = [
            .category(name: "Покупки"),
            .account(name: "Карта", reason: .byDefault),
            .currency(code: "USD", reason: .noUsdAccount),
        ]
    ) -> CapturedRecord {
        CapturedRecord(
            id: "rec-headphones",
            type: .expense,
            amountMinor: amountMinor,
            currency: currency,
            categoryId: categoryId,
            category: "Покупки",
            accountId: accountId,
            accountName: "Карта",
            description: "наушники",
            needsReview: true,
            assumptions: assumptions,
            deletedAt: nil
        )
    }

    @Test("запись как записана — «Что я предположил»: категория, счёт по умолчанию, доллары на сумовом счёте")
    func assumed() throws {
        #expect(RecordReview.of(try record(), answer: answer()) == .assumed([
            "Категорию «Покупки» выбрал сам",
            "Счёт «Карта» — по умолчанию",
            "Доллары — на сумовом счёте: долларового нет",
        ]))
    }

    @Test("тысячи — «45» понял как 45 000 сум")
    func thousands() throws {
        let coffee = try record(categoryId: "cat-cafe", category: "Кафе", amountMinor: 4_500_000, currency: "UZS")
        let kept = answer(
            categoryId: "cat-cafe", amountMinor: 4_500_000, currency: "UZS",
            assumptions: [.thousands(written: "45", amount: 45_000), .account(name: "Карта", reason: .hint)]
        )

        // The account named by the phrase is no guess
        #expect(RecordReview.of(coffee, answer: kept) == .assumed(["«45» понял как 45\u{00A0}000\u{00A0}сум"]))
    }

    @Test("категорию назвали по-новому в Mini App — новое имя: id тот же")
    func renamedCategory() throws {
        #expect(RecordReview.of(try record(category: "Техника"), answer: answer()) == .assumed([
            "Категорию «Техника» выбрал сам",
            "Счёт «Карта» — по умолчанию",
            "Доллары — на сумовом счёте: долларового нет",
        ]))
    }

    @Test(
        "запись правили после записи — общая фраза: другая категория, счёт, сумма или валюта",
        arguments: [
            ("категория", "cat-gadgets", "acc-card", 5_500, "USD"),
            ("счёт", "cat-shopping", "acc-cash", 5_500, "USD"),
            ("сумма", "cat-shopping", "acc-card", 6_000, "USD"),
            ("валюта", "cat-shopping", "acc-card", 5_500, "UZS"),
        ]
    )
    func editedSince(what: String, categoryId: String, accountId: String, amountMinor: Int, currency: String) throws {
        let edited = try record(categoryId: categoryId, amountMinor: amountMinor, currency: currency, accountId: accountId)
        #expect(RecordReview.of(edited, answer: answer()) == .unsure, "\(what)")
    }

    @Test("ответа нет (бот, Mini App, старая сборка), догадок нет (повтор после потерянного ответа) — общая фраза")
    func noGuesses() throws {
        #expect(RecordReview.of(try record(), answer: nil) == .unsure)
        #expect(RecordReview.of(try record(), answer: answer(assumptions: [])) == .unsure)
        // Only the account the phrase named: nothing was taken for granted
        #expect(RecordReview.of(try record(), answer: answer(assumptions: [.account(name: "Карта", reason: .hint)])) == .unsure)
    }

    @Test("тексты шторки")
    func texts() {
        #expect(RecordReview.unsureText == "Сервер не был уверен — проверь сумму, категорию и счёт")
        #expect(RecordReview.assumedTitle == "Что я предположил")
        #expect(RecordReview.editedElsewhere == "Сумма и счёт правятся в Mini App")
    }
}
