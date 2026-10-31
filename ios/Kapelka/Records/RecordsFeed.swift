import Foundation
import os

/// What the list gets for its first page.
enum FirstPage: Equatable, Sendable {
    /// The server answered; the page is on disk now.
    case fresh(RecordsSnapshot)
    /// It did not: the disk's copy for this address — `nil` when there is none — and why.
    case saved(RecordsSnapshot?, RecordsFailure)
}

/// The records of the server for the screens of FT-220 and FT-221: the first page with its copy on disk, the next
/// pages, the categories, and the three edits. The server decides every edit, and the page on disk follows its
/// answer, so the list without a network never shows a deleted record or an old category. Nothing waits on the phone:
/// an edit without a network fails and changes nothing (decision 2026-10-31).
actor RecordsFeed {
    private static let logger = Logger(subsystem: "kapelka", category: "records-feed")

    private let client: RecordsClient
    private let cache: RecordsCacheFile
    private let now: @Sendable () -> Date
    /// Refreshes whose page is still on the way.
    private var refreshing = 0
    /// Edits the server confirmed while a refresh was on the way: its page may have been read before them.
    private var editsDuringRefresh: [RecordEdit] = []

    init(client: RecordsClient, cache: RecordsCacheFile, now: @escaping @Sendable () -> Date = { Date() }) {
        self.client = client
        self.cache = cache
        self.now = now
    }

    /// The page on disk for the current address, without the network: what the list shows before `refresh` answers.
    func saved() -> RecordsSnapshot? {
        client.configuration().flatMap { snapshot(for: $0.baseURL.absoluteString) }
    }

    /// The first page from the server, saved with the moment it came; without the server — the copy on disk.
    func refresh() async -> FirstPage {
        guard let configuration = client.configuration() else { return .saved(nil, .notConfigured) }
        let address = configuration.baseURL.absoluteString
        let firstEdit = editsDuringRefresh.count
        refreshing += 1
        defer { finishRefresh() }
        do {
            let page = try await client.pinned(to: configuration).page()
            let edited = editsDuringRefresh[firstEdit...].reduce(page) { $1.applied(to: $0) }
            let snapshot = RecordsSnapshot(address: address, page: edited, updatedAt: now())
            store(snapshot)
            return .fresh(snapshot)
        } catch {
            return .saved(snapshot(for: address), error)
        }
    }

    /// A later page; it is not kept on disk.
    func page(after cursor: String) async throws(RecordsFailure) -> RecordsPage {
        try await client.page(after: cursor)
    }

    func categories() async throws(RecordsFailure) -> [RecordCategory] {
        try await client.categories()
    }

    /// Gone on the server — deleted here or already elsewhere (`recordGone`) — gone on disk too.
    func delete(_ id: String) async throws(RecordsFailure) {
        do {
            try await client.delete(id)
            apply(.removed(id: id))
        } catch {
            if error == .recordGone { apply(.removed(id: id)) }
            throw error
        }
    }

    /// «Вернуть»: the record the server gave back goes to its place on the page on disk.
    func restore(_ id: String) async throws(RecordsFailure) -> Record {
        let record = try await client.restore(id)
        apply(.restored(record))
        return record
    }

    /// The record as the server saved it replaces the one on disk.
    func setCategory(_ categoryId: String, of id: String) async throws(RecordsFailure) -> Record {
        do {
            let record = try await client.setCategory(categoryId, of: id)
            apply(.changed(record))
            return record
        } catch {
            if error == .recordGone { apply(.removed(id: id)) }
            throw error
        }
    }

    private func finishRefresh() {
        refreshing -= 1
        if refreshing == 0 {
            editsDuringRefresh = []
        }
    }

    private func apply(_ edit: RecordEdit) {
        if refreshing > 0 {
            editsDuringRefresh.append(edit)
        }
        guard let current = saved() else { return }
        store(RecordsSnapshot(address: current.address, page: edit.applied(to: current.page), updatedAt: current.updatedAt))
    }

    private func snapshot(for address: String) -> RecordsSnapshot? {
        cache.load().flatMap { $0.address == address ? $0 : nil }
    }

    /// A copy that did not save is not a failure of the list: the next answer writes it again.
    private func store(_ snapshot: RecordsSnapshot) {
        do {
            try cache.save(snapshot)
        } catch {
            Self.logger.error("Records page not saved: \(error.localizedDescription, privacy: .public)")
        }
    }
}

/// A change the server made to one record, applied to a page that may not show it yet. Applying it twice changes
/// nothing more.
private enum RecordEdit: Sendable {
    case removed(id: String)
    case restored(Record)
    case changed(Record)

    func applied(to page: RecordsPage) -> RecordsPage {
        switch self {
        case let .removed(id):
            return RecordsPage(items: page.items.filter { $0.id != id }, nextCursor: page.nextCursor)
        case let .changed(record):
            return replacing(record, in: page)
        case let .restored(record):
            guard !page.items.contains(where: { $0.id == record.id }) else { return replacing(record, in: page) }
            let index = page.items.firstIndex { record.precedes($0) } ?? page.items.endIndex
            // Older than the whole page while more pages follow: its place is on one of them
            guard index < page.items.endIndex || page.nextCursor == nil else { return page }
            let items = Array(page.items[..<index]) + [record] + Array(page.items[index...])
            return RecordsPage(items: items, nextCursor: page.nextCursor)
        }
    }

    private func replacing(_ record: Record, in page: RecordsPage) -> RecordsPage {
        RecordsPage(items: page.items.map { $0.id == record.id ? record : $0 }, nextCursor: page.nextCursor)
    }
}
