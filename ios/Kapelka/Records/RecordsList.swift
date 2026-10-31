import Foundation
import Observation

/// The tab «Записи» (FT-220): the server's records by day, the next page while scrolling, the copy on disk without a
/// network. It refreshes when the tab opens, when the app comes back with the tab open, on a pull, and after the queue
/// wrote a record while the tab is open; never on a timer (decision 2026-10-31). The tab's own refresh on opening
/// covers the queue's records written while it was closed.
@MainActor
@Observable
final class RecordsList {
    /// What the tab shows instead of the list, or the list.
    enum Screen: Equatable {
        /// Nothing yet: the first answer is on its way and there is no copy on disk.
        case loading
        /// No address or token: «Настройки».
        case notConfigured
        case list
        /// The server answered with no records.
        case empty
        /// No records to show and no answer.
        case unreachable
        /// The server refused the token, and nothing is on disk.
        case tokenRefused
    }

    private(set) var days: [RecordDay] = []
    private(set) var screen: Screen = .loading
    /// «Нет связи · обновлено в 14:32» over a list the server did not refresh.
    private(set) var caption: String?
    /// The cursor of the page after the shown ones; `nil` after the last.
    private(set) var nextCursor: String?
    /// Another page waits on the server.
    var hasMore: Bool { nextCursor != nil }
    /// The identity of the row at the list's end, which asks for the next page once on screen. New with each cursor
    /// and each start from the first page: a refresh that brings the same first page drops the page on its way, and
    /// the row must ask again even though the cursor is the same.
    var nextPageKey: String? { nextCursor.map { "\(generation)/\($0)" } }
    /// The next page did not come; the list keeps its rows and the next scroll or tap asks again.
    private(set) var moreProblem: RecordsFailure?

    private let feed: RecordsFeed
    private let now: @Sendable () -> Date
    private let calendar: Calendar

    /// The first page as the server or the disk gave it.
    private var shown: RecordsSnapshot?
    /// The pages read while scrolling, after the first.
    private var more: [Record] = []
    private var problem: RecordsFailure?
    private var accountNames: [String: String] = [:]
    private var checkedDisk = false
    /// Bumped each time the list starts again from the first page: a next page asked for before that is dropped.
    private var generation = 0
    /// The generation whose next page is on its way.
    private var loadingMoreIn: Int?
    private var isOnScreen = false
    /// The refresh running now; calls during it join it with one more pass after it.
    private var refreshing: Task<Void, Never>?
    private var refreshAgain = false

    init(feed: RecordsFeed, now: @escaping @Sendable () -> Date = { Date() }, calendar: Calendar = .current) {
        self.feed = feed
        self.now = now
        self.calendar = calendar
    }

    /// `true` when the tab just opened in the active app, or the app came back to it: then it refreshes. Off screen
    /// nothing is asked. Synchronous, so the screen's changes land in their order.
    func setOnScreen(_ onScreen: Bool) -> Bool {
        let opened = onScreen && !isOnScreen
        isOnScreen = onScreen
        return opened
    }

    func screenChanged(onScreen: Bool) async {
        if setOnScreen(onScreen) {
            await refresh()
        }
    }

    /// The queue got a record onto the server: the open list shows it.
    func queueWroteRecords() async {
        guard isOnScreen else { return }
        await refresh()
    }

    /// The first page and the account names. A call while a refresh runs waits for it and one more pass after it:
    /// the pass that runs may have read the page before the call's reason — a record just sent.
    func refresh() async {
        refreshAgain = true
        if let refreshing {
            await refreshing.value
            return
        }
        let run = Task {
            while refreshAgain {
                refreshAgain = false
                await refreshOnce()
            }
            // The last check and this run in one turn of the main actor: no call slips in between
            refreshing = nil
        }
        refreshing = run
        await run.value
    }

    /// The page after the last one shown; nothing when none is left or it is already on its way.
    func loadMore() async {
        guard let cursor = nextCursor, loadingMoreIn != generation else { return }
        let started = generation
        loadingMoreIn = started
        moreProblem = nil
        let result: Result<RecordsPage, RecordsFailure>
        do {
            result = .success(try await feed.page(after: cursor))
        } catch {
            result = .failure(error)
        }
        // The list started again from the first page meanwhile: this page follows a cursor it no longer has
        guard generation == started else { return }
        loadingMoreIn = nil
        switch result {
        case let .success(page):
            let known = Set((shown?.page.items ?? []).map(\.id) + more.map(\.id))
            more += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
        case let .failure(failure):
            moreProblem = failure
        }
        rebuild()
    }

    private func refreshOnce() async {
        if !checkedDisk {
            // The copy on disk while the server is asked
            checkedDisk = true
            if shown == nil, let saved = await feed.saved() {
                startAgain(from: saved)
                rebuild()
            }
        }
        async let names = Self.accountNames(feed)
        let first = await feed.refresh()
        if let names = await names {
            accountNames = names
        }
        switch first {
        case let .fresh(snapshot):
            problem = nil
            startAgain(from: snapshot)
        case let .saved(snapshot, failure):
            problem = failure
            if let snapshot {
                // The same first page as on screen: the pages scrolled to stay
                if snapshot.address == shown?.address, snapshot.updatedAt == shown?.updatedAt {
                    shown = snapshot
                } else {
                    startAgain(from: snapshot)
                }
            } else {
                // Not configured, or another address without a copy: the old server's records must not stay
                shown = nil
                more = []
                nextCursor = nil
                generation += 1
            }
        }
        rebuild()
    }

    /// `nil` when they did not come: the names shown before stay; without any the rows show the category alone.
    private static func accountNames(_ feed: RecordsFeed) async -> [String: String]? {
        do {
            let accounts = try await feed.accounts()
            return Dictionary(accounts.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        } catch {
            return nil
        }
    }

    private func startAgain(from snapshot: RecordsSnapshot) {
        shown = snapshot
        more = []
        nextCursor = snapshot.page.nextCursor
        moreProblem = nil
        generation += 1
    }

    private func rebuild() {
        let records = (shown?.page.items ?? []) + more
        let moment = now()
        days = RecordDays.days(records, accountNames: accountNames, now: moment, calendar: calendar)
        caption = RecordsCaption.text(problem: problem, updatedAt: shown?.updatedAt, now: moment, calendar: calendar)
        screen = Self.screen(hasRecords: !records.isEmpty, answered: shown != nil, problem: problem)
    }

    private static func screen(hasRecords: Bool, answered: Bool, problem: RecordsFailure?) -> Screen {
        switch problem {
        case .notConfigured: return .notConfigured
        case _ where hasRecords: return .list
        case nil: return answered ? .empty : .loading
        case .tokenRefused: return .tokenRefused
        default: return .unreachable
        }
    }
}
