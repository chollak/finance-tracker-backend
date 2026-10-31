import Foundation
import os

private let logger = Logger(subsystem: "kapelka", category: "records")

/// One record of the history (`GET /api/transactions`, FT-107) — the same answer the Mini App reads
/// (`docs/pastel/api.md`). Also how the first page lies on disk (`RecordsCacheFile`).
struct Record: Codable, Equatable, Identifiable, Sendable {
    enum Kind: String, Codable, Sendable {
        case income
        case expense
    }

    let id: String
    /// The record's day in Tashkent, `YYYY-MM-DD`; records saved before FT-100 may keep a full moment.
    let date: String
    let type: Kind
    /// Integer hundredths of `currency` (FT-097): tiyins or cents.
    let amountMinor: Int
    /// `UZS` or `USD` (FT-103); the server answers `UZS` for older records.
    let currency: String
    /// The user's category (FT-099); `nil` only on records from before it.
    let categoryId: String?
    /// The category's current name: a renamed one shows its new name.
    let category: String
    let categoryColor: String?
    let accountId: String?
    /// The note; may be empty (FT-113).
    let description: String
    let merchant: String?
    /// «Проверить»: the parsing was unsure and waits for a correction.
    let needsReview: Bool
    /// Where it came from: `telegram`, `miniapp`, `ios_shortcut`, `apple_pay`… (FT-103).
    let source: String?
    /// ISO moment the record was written; orders the records of one day.
    let createdAt: String?
}

extension Record {
    /// Only what the list needs is required. A missing optional field takes the server's own default, so an older
    /// record or a newer server still reads; a record without these fields is left out of its page (`LossyList`).
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        date = try container.decode(String.self, forKey: .date)
        type = try container.decode(Kind.self, forKey: .type)
        amountMinor = try container.decode(Int.self, forKey: .amountMinor)
        currency = try container.decodeIfPresent(String.self, forKey: .currency) ?? "UZS"
        categoryId = try container.decodeIfPresent(String.self, forKey: .categoryId)
        category = try container.decodeIfPresent(String.self, forKey: .category) ?? ""
        categoryColor = try container.decodeIfPresent(String.self, forKey: .categoryColor)
        accountId = try container.decodeIfPresent(String.self, forKey: .accountId)
        description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        merchant = try container.decodeIfPresent(String.self, forKey: .merchant)
        needsReview = try container.decodeIfPresent(Bool.self, forKey: .needsReview) ?? false
        source = try container.decodeIfPresent(String.self, forKey: .source)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
    }

    /// `true` when `self` comes before `other` in the history: newest first by day, then by the moment of creation,
    /// then by id — the server's order, compared as the stored strings, the way SQLite does.
    func precedes(_ other: Record) -> Bool {
        (date, createdAt ?? "", id) > (other.date, other.createdAt ?? "", other.id)
    }
}

/// One page of the history: the records newest first and the cursor of the next page, `nil` on the last one. The
/// server's `summary` belongs to a search or a filter, which the app does not send.
struct RecordsPage: Codable, Equatable, Sendable {
    let items: [Record]
    let nextCursor: String?
}

extension RecordsPage {
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        items = try container.decode(LossyList<Record>.self, forKey: .items).elements
        nextCursor = try container.decodeIfPresent(String.self, forKey: .nextCursor)
    }
}

/// A category of `GET /api/categories` (FT-099): hidden ones come too, the server's order kept.
struct RecordCategory: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let type: Record.Kind
    let name: String
    /// Hidden: gone from the choice, its records stay.
    let isHidden: Bool
}

extension RecordCategory {
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        type = try container.decode(Record.Kind.self, forKey: .type)
        name = try container.decode(String.self, forKey: .name)
        isHidden = try container.decodeIfPresent(Bool.self, forKey: .isHidden) ?? false
    }
}

/// A list in which an element the phone cannot read is left out instead of failing the whole answer: one odd record
/// must not turn the list into «нет связи». The record stays visible in the Mini App.
struct LossyList<Element: Decodable>: Decodable {
    let elements: [Element]

    init(from decoder: any Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var elements: [Element] = []
        var skipped = 0
        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                elements.append(element)
            } else {
                // A failed decode does not move the container on; this one reads anything and does
                _ = try container.decode(Skipped.self)
                skipped += 1
            }
        }
        if skipped > 0 {
            logger.error("\(skipped, privacy: .public) of \(elements.count + skipped, privacy: .public) not readable, left out")
        }
        self.elements = elements
    }

    private struct Skipped: Decodable {
        init(from decoder: any Decoder) throws {}
    }
}
