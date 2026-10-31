import Foundation

/// The server's answer for a sent record (`data` of `POST /api/quick-capture` and `/payment`,
/// `docs/QUICK_CAPTURE_API.md`): the ack the screens show and, since FT-255, what was written, record by record — what
/// the haptics, the notices, «!» and the card of FT-251…FT-254 are built on.
struct CaptureReply: Codable, Equatable, Sendable {
    /// `saved`, `needs_review` or `no_transaction`.
    let status: String
    let title: String
    let summary: String
    /// The records the server wrote (`transactions`), in its order; none in a file from before FT-255.
    let records: [CapturedRecord]
    /// What the phrase named without an amount: nothing was written for it (FT-123).
    let withoutAmount: [CapturedWithoutAmount]
    /// The answer to a repeat of the `clientId` (FT-106). The queue sends a record again only when the first answer
    /// was lost (a timeout, the PC asleep), so there is no earlier answer on the phone. The server reads a repeat from
    /// the database, which keeps neither the account's name, nor the assumptions, nor what was named without an
    /// amount: they come empty, and FT-252 and FT-254 take that for «нет данных», not for «не было».
    let repeated: Bool

    init(
        status: String,
        title: String,
        summary: String,
        records: [CapturedRecord] = [],
        withoutAmount: [CapturedWithoutAmount] = [],
        repeated: Bool = false
    ) {
        self.status = status
        self.title = title
        self.summary = summary
        self.records = records
        self.withoutAmount = withoutAmount
        self.repeated = repeated
    }

    // A file from before FT-255 has the ack alone: the rest takes «nothing written»
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decode(String.self, forKey: .status)
        title = try container.decode(String.self, forKey: .title)
        summary = try container.decode(String.self, forKey: .summary)
        records = container.lenientList(CapturedRecord.self, forKey: .records)
        withoutAmount = container.lenientList(CapturedWithoutAmount.self, forKey: .withoutAmount)
        repeated = (try? container.decodeIfPresent(Bool.self, forKey: .repeated)) ?? false
    }
}

/// One record the server wrote (`CapturedTransaction` of the answer), as the queue keeps it (FT-255).
struct CapturedRecord: Codable, Equatable, Sendable {
    /// The record's id: «Записи» show, delete and change it by it.
    let id: String
    /// Income «+», expense «−».
    let type: Record.Kind
    /// Integer hundredths of `currency` (FT-097).
    let amountMinor: Int
    /// `UZS` or `USD` (FT-103).
    let currency: String
    /// The category's name when it was written.
    let category: String
    /// The account's name when it was written; `nil` on a repeat (FT-106).
    let accountName: String?
    /// «Проверить»: the parse was unsure.
    let needsReview: Bool
    /// What the parse took for granted (FT-103); none on a repeat.
    let assumptions: [CaptureAssumption]
}

extension CapturedRecord {
    /// The id, the direction and the amount are required: a record without them is left out of the answer rather
    /// than kept with a made-up amount. The rest takes the server's own defaults.
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        type = try container.decode(Record.Kind.self, forKey: .type)
        amountMinor = try container.decode(Int.self, forKey: .amountMinor)
        currency = try container.decodeIfPresent(String.self, forKey: .currency) ?? "UZS"
        category = try container.decodeIfPresent(String.self, forKey: .category) ?? ""
        accountName = try container.decodeIfPresent(String.self, forKey: .accountName)
        needsReview = try container.decodeIfPresent(Bool.self, forKey: .needsReview) ?? false
        assumptions = container.lenientList(CaptureAssumption.self, forKey: .assumptions)
    }
}

/// What the parse took for granted (`assumptions` of a record, `docs/pastel/api.md`, «Догадки разбора»), kept in the
/// server's own shape: `kind` and its fields.
enum CaptureAssumption: Codable, Equatable, Sendable {
    /// «45» read as 45 000: as written, and the amount in whole сум.
    case thousands(written: String, amount: Int)
    /// A category no word of the record names: the AI's choice or «Другое» (FT-138).
    case category(name: String)
    /// The account the record went to, and why that one.
    case account(name: String, reason: AccountReason)
    /// Dollars kept on a сум account (FT-103).
    case currency(code: String, reason: CurrencyReason)

    enum AccountReason: String, Codable, Sendable {
        /// Named by the phrase («нал», «с Humo»), or the card's account for a payment.
        case hint
        /// None named: the default account.
        case byDefault = "default"
    }

    enum CurrencyReason: String, Codable, Sendable {
        /// No dollar account: the record waits for a look.
        case noUsdAccount = "no_usd_account"
    }

    private enum CodingKeys: String, CodingKey {
        case kind
        case written
        case amount
        case name
        case reason
        case currency
    }

    /// A kind or a reason this build does not know fails, and the list leaves that one out (`LossyList`).
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "thousands":
            self = .thousands(
                written: try container.decode(String.self, forKey: .written),
                amount: try container.decode(Int.self, forKey: .amount)
            )
        case "category":
            self = .category(name: try container.decode(String.self, forKey: .name))
        case "account":
            self = .account(
                name: try container.decode(String.self, forKey: .name),
                reason: try container.decode(AccountReason.self, forKey: .reason)
            )
        case "currency":
            self = .currency(
                code: try container.decode(String.self, forKey: .currency),
                reason: try container.decode(CurrencyReason.self, forKey: .reason)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind, in: container, debugDescription: "Unknown kind \(kind)"
            )
        }
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .thousands(written, amount):
            try container.encode("thousands", forKey: .kind)
            try container.encode(written, forKey: .written)
            try container.encode(amount, forKey: .amount)
        case let .category(name):
            try container.encode("category", forKey: .kind)
            try container.encode(name, forKey: .name)
        case let .account(name, reason):
            try container.encode("account", forKey: .kind)
            try container.encode(name, forKey: .name)
            try container.encode(reason, forKey: .reason)
        case let .currency(code, reason):
            try container.encode("currency", forKey: .kind)
            try container.encode(code, forKey: .currency)
            try container.encode(reason, forKey: .reason)
        }
    }
}

/// Named by the phrase without an amount, so not written (FT-123): «такси» in «кофе 25к, такси».
struct CapturedWithoutAmount: Codable, Equatable, Sendable {
    /// As the phrase names it: «такси».
    let description: String
    /// The category the parser chose, by name; empty when it gave none.
    let category: String
}

extension CapturedWithoutAmount {
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        description = try container.decode(String.self, forKey: .description)
        category = try container.decodeIfPresent(String.self, forKey: .category) ?? ""
    }
}

extension KeyedDecodingContainer {
    /// A list the answer may lack or carry in a form this build does not know: then none, and an element it cannot
    /// read is left out. What was written is extra to the ack: it never turns a written record back into a waiting
    /// one.
    func lenientList<Element: Decodable>(_ type: Element.Type, forKey key: Key) -> [Element] {
        (try? decodeIfPresent(LossyList<Element>.self, forKey: key))?.elements ?? []
    }
}
