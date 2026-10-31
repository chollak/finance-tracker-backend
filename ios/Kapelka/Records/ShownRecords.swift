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

    /// «Вернуть»: the record goes to its place in the server's order. `nil` when it has none here: older than
    /// everything shown while more pages follow. Then its place is on one of them — unless it was shown here before
    /// its delete (`wasShown`): the cursor of the next page is already behind it, no page brings it again, and it goes
    /// last. A record that ends up in both parts — on the disk's first page and on a scrolled one — shows once (`RecordsList`).
    func restoring(_ record: Record, wasShown: Bool, morePagesFollow: Bool) -> ShownRecords? {
        if (first + more).contains(where: { $0.id == record.id }) {
            return replacing(record)
        }
        let all = first + more
        let index = all.firstIndex { record.precedes($0) } ?? all.endIndex
        if index == all.endIndex, morePagesFollow, !wasShown {
            return nil
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
