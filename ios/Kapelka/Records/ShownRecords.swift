import Foundation

/// The records on screen as two parts: the first page, which the disk keeps too, and the pages read while scrolling.
/// The edits of FT-221 change both, so a scrolled record goes and comes back like one on the first page.
struct ShownRecords: Equatable, Sendable {
    var first: [Record]
    var more: [Record]

    /// Without the record, wherever it is.
    func removing(_ id: String) -> ShownRecords {
        ShownRecords(first: first.filter { $0.id != id }, more: more.filter { $0.id != id })
    }

    /// The server's copy in place of the one shown; nothing when it is not shown.
    func replacing(_ record: Record) -> ShownRecords {
        ShownRecords(
            first: first.map { $0.id == record.id ? record : $0 },
            more: more.map { $0.id == record.id ? record : $0 }
        )
    }

    /// «Вернуть»: the record goes to its place in the server's order. Older than everything shown while more pages
    /// follow — its place is on one of them, and the scroll brings it. It goes into the part the disk's page would
    /// hold it in too (`RecordsFeed`), so a refresh without a network that keeps the scrolled pages shows it once.
    func restoring(_ record: Record, morePagesFollow: Bool) -> ShownRecords {
        if (first + more).contains(where: { $0.id == record.id }) {
            return replacing(record)
        }
        let all = first + more
        let index = all.firstIndex { record.precedes($0) } ?? all.endIndex
        if index == all.endIndex, morePagesFollow {
            return self
        }
        if index < first.count || more.isEmpty {
            return ShownRecords(first: Self.inserting(record, at: index, into: first), more: more)
        }
        return ShownRecords(first: first, more: Self.inserting(record, at: index - first.count, into: more))
    }

    private static func inserting(_ record: Record, at index: Int, into records: [Record]) -> [Record] {
        Array(records[..<index]) + [record] + Array(records[index...])
    }
}
