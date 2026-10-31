import Foundation
@testable import Kapelka

/// Whole answers of `POST /api/quick-capture` and `/payment` with records in them (FT-255). «из документации» — word
/// for word from `docs/QUICK_CAPTURE_API.md`; «с сервера» — what the server of this repository answered on 2026-11-01
/// (a test database, the dictionary without the AI, ids as it gave them); «с сервера с ИИ» — the same with the real
/// AI, from the review of PR #167; the rest is built by the contract of `QUICK_CAPTURE_API.md`.
enum CaptureReplyBodies {
    struct NotSent: Error {
        let outcome: SendOutcome
    }

    /// The body as the queue keeps it: what `CaptureClient` reads from a 200 with it.
    static func reply(_ body: String) throws -> CaptureReply {
        let outcome = CaptureClient.outcome(status: 200, retryAfter: nil, body: Data(body.utf8))
        guard case let .sent(reply) = outcome else { throw NotSent(outcome: outcome) }
        return reply
    }

    /// A record of the queue the server took with this body.
    static func sentCapture(_ clientId: UUID, text: String, body: String) throws -> Capture {
        var capture = Capture(clientId: clientId, text: text, capturedAt: Date(), timeZoneIdentifier: "Asia/Tashkent")
        capture.state = .sent
        capture.attempts = 1
        capture.reply = try reply(body)
        return capture
    }

    /// Из документации: «An unknown merchant, the card's account named».
    static let paymentFromDocs = """
        {
          "success": true,
          "data": {
            "status": "saved",
            "text": "KORZINKA 24",
            "source": "apple_pay",
            "transactions": [
              {
                "id": "ff1a09d9-b1d4-410a-9f8f-10f872ab580a",
                "amount": 25000,
                "amountMinor": 2500000,
                "currency": "UZS",
                "accountId": "…",
                "accountName": "Карта",
                "assumptions": [
                  { "kind": "category", "name": "Продукты" },
                  { "kind": "account", "name": "Карта", "reason": "hint" }
                ],
                "type": "expense",
                "semanticType": "expense",
                "category": "Продукты",
                "categoryId": "…",
                "description": "KORZINKA 24",
                "merchant": "KORZINKA 24",
                "date": "2026-10-29",
                "needsReview": false,
                "countsAsRealExpense": true
              }
            ],
            "debts": [],
            "ack": { "title": "Записал", "summary": "KORZINKA 24 · 25 000 сум · Продукты?", "details": "2026-10-29", "actions": ["edit", "delete"] },
            "review": { "reasons": [] }
          },
          "message": "Quick capture processed",
          "timestamp": "2026-10-30T05:52:43.110Z"
        }
        """

    /// Из документации: «Capture from this machine (local dev)».
    static let taxiFromDocs = """
        {
          "success": true,
          "data": {
            "status": "saved",
            "text": "такси 18к",
            "source": "miniapp",
            "transactions": [
              {
                "id": "tx-1",
                "amount": 18000,
                "amountMinor": 1800000,
                "currency": "UZS",
                "accountId": "acc-1",
                "accountName": "Карта",
                "assumptions": [
                  { "kind": "account", "name": "Карта", "reason": "default" }
                ],
                "type": "expense",
                "semanticType": "expense",
                "category": "Транспорт",
                "categoryId": "cat-transport",
                "description": "такси",
                "merchant": "такси",
                "date": "2026-09-02",
                "confidence": 1,
                "needsReview": false,
                "countsAsRealExpense": true
              }
            ],
            "debts": [],
            "ack": {
              "title": "Записал",
              "summary": "Такси · 18 000 сум · Транспорт",
              "details": "Сегодня",
              "actions": ["edit", "delete"]
            },
            "review": { "reasons": [] }
          },
          "message": "Quick capture processed",
          "timestamp": "2026-09-02T16:24:23.000Z"
        }
        """

    /// The `clientId` «кофе 45» went with to the server.
    static let coffeeClientId = UUID(uuidString: "11111111-2222-4333-8444-555555555502")!
    static let coffeeId = "a109e501-2649-4dad-985c-9cf3234ce88b"

    /// С сервера: «кофе 45» — «45» read as 45 000, the default account.
    static let coffee = """
        {"success":true,"data":{"status":"saved","text":"кофе 45","source":"ios_shortcut","transactions":[\
        {"id":"a109e501-2649-4dad-985c-9cf3234ce88b","amount":45000,"amountMinor":4500000,"currency":"UZS",\
        "accountId":"26da76bc-f575-46c8-74d7-8ffd3e562694","accountName":"Карта","assumptions":[\
        {"kind":"thousands","written":"45","amount":45000},{"kind":"account","name":"Карта","reason":"default"}],\
        "type":"expense","semanticType":"expense","category":"Кафе",\
        "categoryId":"637c7a38-2079-4094-a0dd-c40c5d36c211","description":"кофе","merchant":"кофе",\
        "date":"2026-10-31","confidence":1,"needsReview":false,\
        "countsAsRealExpense":true}],"debts":[],"ack":{"title":"Записал","summary":"Кофе · 45 000 сум · Кафе",\
        "details":"2026-10-31","actions":["edit","delete"]},"review":{"reasons":[]}},\
        "message":"Quick capture processed","timestamp":"2026-10-31T20:57:48.506Z"}
        """

    /// С сервера: the same `clientId` again after the record was deleted — the record from the database, without the
    /// account's name and the assumptions, with `deletedAt`, and `repeated: true`.
    static let coffeeRepeated = """
        {"success":true,"data":{"status":"saved","text":"кофе 45","source":"ios_shortcut","transactions":[\
        {"id":"a109e501-2649-4dad-985c-9cf3234ce88b","amount":45000,"amountMinor":4500000,"currency":"UZS",\
        "accountId":"26da76bc-f575-46c8-74d7-8ffd3e562694","type":"expense","semanticType":"expense",\
        "category":"Кафе","categoryId":"637c7a38-2079-4094-a0dd-c40c5d36c211","description":"кофе",\
        "merchant":"кофе","date":"2026-10-31","confidence":1,"needsReview":false,"countsAsRealExpense":true,\
        "deletedAt":"2026-10-31T20:58:13.433Z"}],"debts":[],"ack":{"title":"Записал",\
        "summary":"Кофе · 45 000 сум · Кафе","details":"2026-10-31","actions":["edit","delete"]},\
        "review":{"reasons":[]},"repeated":true},"message":"Quick capture processed",\
        "timestamp":"2026-10-31T20:58:13.453Z"}
        """

    /// С сервера: a record of the history (`GET /api/transactions`) written by «кофе 45»: it carries the `clientId`.
    static let coffeeInHistory = """
        {"id":"a109e501-2649-4dad-985c-9cf3234ce88b","amountMinor":4500000,"amount":45000,"type":"expense",\
        "semanticType":"expense","needsReview":false,"description":"кофе","date":"2026-10-31",\
        "userId":"1c7f1922-48e1-4c9c-9784-cbfcb315442b","merchant":"кофе","confidence":1,"originalText":"кофе 45",\
        "originalParsing":{"amount":45000,"category":"Кафе","type":"expense","semanticType":"expense",\
        "needsReview":false,"merchant":"кофе","confidence":1,"categoryId":"637c7a38-2079-4094-a0dd-c40c5d36c211"},\
        "categoryId":"637c7a38-2079-4094-a0dd-c40c5d36c211","category":"Кафе","categoryColor":"rose",\
        "accountId":"26da76bc-f575-46c8-74d7-8ffd3e562694","currency":"UZS","source":"ios_shortcut",\
        "isArchived":false,"createdAt":"2026-10-31T20:57:48.000Z","clientId":"11111111-2222-4333-8444-555555555502"}
        """

    /// С сервера с ИИ: «кофе 25к, такси» — «такси» has no amount, so only the coffee is written (FT-123).
    static let coffeeAndTaxiWithoutAmount = """
        {"success":true,"data":{"status":"saved","text":"кофе 25к, такси","source":"ios_shortcut",\
        "transactions":[{"id":"c5b63732-5ffd-455e-851d-f9eb80f3ea38","amount":25000,"amountMinor":2500000,\
        "currency":"UZS","accountId":"3cacdec0-0136-11a2-62a2-12e4e96411cf","accountName":"Карта",\
        "assumptions":[{"kind":"account","name":"Карта","reason":"default"}],"type":"expense","semanticType":"expense",\
        "category":"Кафе","categoryId":"92c6b80d-4b33-438b-a628-d40e21c5d1fc","description":"кофе","merchant":"кофе",\
        "date":"2026-11-01","confidence":0.9,"needsReview":false,"countsAsRealExpense":true}],"debts":[],\
        "ack":{"title":"Записал","summary":"Кофе · 25 000 сум · Кафе","details":"Сегодня","actions":["edit","delete"]},\
        "review":{"reasons":[]},"withoutAmount":[{"description":"такси","category":"Транспорт","type":"expense",\
        "semanticType":"expense","date":"2026-11-01","merchant":"такси"}]},"message":"Quick capture processed",\
        "timestamp":"2026-10-31T21:31:14.538Z"}
        """

    /// С сервера с ИИ: «хлеб 5к и бензин 200к картой» — two records, each with its own note.
    static let breadAndPetrol = """
        {"success":true,"data":{"status":"saved","text":"хлеб 5к и бензин 200к картой","source":"ios_shortcut",\
        "transactions":[{"id":"c4b400f6-62a2-4fd0-8624-b71d7dcd23fa","amount":5000,"amountMinor":500000,\
        "currency":"UZS","accountId":"3cacdec0-0136-11a2-62a2-12e4e96411cf","accountName":"Карта",\
        "assumptions":[{"kind":"category","name":"Продукты"},{"kind":"account","name":"Карта","reason":"default"}],\
        "type":"expense","semanticType":"expense","category":"Продукты",\
        "categoryId":"3e630b99-d1dc-456b-b791-61cf21d5f46e","description":"хлеб","date":"2026-11-01","confidence":0.6,\
        "needsReview":false,"countsAsRealExpense":true},{"id":"9df8b6e3-e460-4377-83cb-8c31806cf31b","amount":200000,\
        "amountMinor":20000000,"currency":"UZS","accountId":"3cacdec0-0136-11a2-62a2-12e4e96411cf",\
        "accountName":"Карта","assumptions":[{"kind":"account","name":"Карта","reason":"hint"}],"type":"expense",\
        "semanticType":"expense","category":"Транспорт","categoryId":"19cfc603-92f8-451b-8ba1-e5868c36a8ae",\
        "description":"бензин","date":"2026-11-01","confidence":0.6,"needsReview":false,"countsAsRealExpense":true}],\
        "debts":[],"ack":{"title":"Записал 2","summary":"Хлеб · 5 000 сум\\nБензин · 200 000 сум","actions":["edit",\
        "delete"]},"review":{"reasons":[]}},"message":"Quick capture processed","timestamp":"2026-10-31T21:31:16.812Z"}
        """

    /// С сервера с ИИ: the same `clientId` again after «бензин» was deleted — `deletedAt` on it, the bread as it was.
    static let breadAndPetrolRepeatedAfterDeletion = """
        {"success":true,"data":{"status":"saved","text":"хлеб 5к и бензин 200к картой","source":"ios_shortcut",\
        "transactions":[{"id":"c4b400f6-62a2-4fd0-8624-b71d7dcd23fa","amount":5000,"amountMinor":500000,\
        "currency":"UZS","accountId":"3cacdec0-0136-11a2-62a2-12e4e96411cf","type":"expense","semanticType":"expense",\
        "category":"Продукты","categoryId":"3e630b99-d1dc-456b-b791-61cf21d5f46e","description":"хлеб","merchant":null,\
        "date":"2026-11-01","confidence":0.6,"needsReview":false,"countsAsRealExpense":true},\
        {"id":"9df8b6e3-e460-4377-83cb-8c31806cf31b","amount":200000,"amountMinor":20000000,"currency":"UZS",\
        "accountId":"3cacdec0-0136-11a2-62a2-12e4e96411cf","type":"expense","semanticType":"expense",\
        "category":"Транспорт","categoryId":"19cfc603-92f8-451b-8ba1-e5868c36a8ae","description":"бензин",\
        "merchant":null,"date":"2026-11-01","confidence":0.6,"needsReview":false,"countsAsRealExpense":true,\
        "deletedAt":"2026-10-31T21:31:57.397Z"}],"debts":[],"ack":{"title":"Записал 2",\
        "summary":"Хлеб · 5 000 сум\\nБензин · 200 000 сум","actions":["edit","delete"]},"review":{"reasons":[]},\
        "repeated":true},"message":"Quick capture processed","timestamp":"2026-10-31T21:32:06.227Z"}
        """

    /// «кофе 25к и наушники 55$»: two records of one phrase — the second's `clientId` on the server is
    /// `<clientId>:1`; the dollars landed on the сум account and wait for a look.
    static let coffeeAndHeadphones = """
        {"success":true,"data":{"status":"needs_review","text":"кофе 25к и наушники 55$","source":"ios_shortcut",\
        "transactions":[{"id":"rec-coffee","amount":25000,"amountMinor":2500000,"currency":"UZS",\
        "accountId":"acc-card","accountName":"Карта","assumptions":[\
        {"kind":"account","name":"Карта","reason":"default"}],"type":"expense","semanticType":"expense",\
        "category":"Кафе","categoryId":"cat-cafe","description":"кофе","date":"2026-10-31","needsReview":false,\
        "countsAsRealExpense":true},{"id":"rec-headphones","amount":55,"amountMinor":5500,"currency":"USD",\
        "accountId":"acc-card","accountName":"Карта","assumptions":[{"kind":"category","name":"Покупки"},\
        {"kind":"account","name":"Карта","reason":"default"},\
        {"kind":"currency","currency":"USD","reason":"no_usd_account"}],"type":"expense","semanticType":"expense",\
        "category":"Покупки","categoryId":"cat-shopping","description":"наушники","date":"2026-10-31",\
        "needsReview":true,"countsAsRealExpense":true}],"debts":[],"ack":{"title":"Записал 2 · 1 к проверке",\
        "summary":"Кофе · 25 000 сум\\nНаушники · 55,00 USD","actions":["edit","delete","review"]},\
        "review":{"reasons":["transaction_needs_review"]}},"message":"Quick capture processed",\
        "timestamp":"2026-10-31T21:00:00.000Z"}
        """
}
