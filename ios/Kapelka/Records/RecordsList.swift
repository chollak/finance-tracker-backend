import Foundation
import Observation

/// The tab «Записи» (FT-220): the server's records by day, the next page while scrolling, the copy on disk without a
/// network. It refreshes when the tab opens, when the app comes back with the tab open, on a pull, and after the queue
/// wrote a record while the tab is open; never on a timer (decision 2026-10-31). The tab's own refresh on opening
/// covers the queue's records written while it was closed.
///
/// FT-221: a swipe deletes, «Вернуть» brings the record back for 5 s, the sheet changes the category. The server
/// decides each edit; without a network nothing changes and nothing waits on the phone (decision 2026-10-31).
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
    /// «Удалено · Вернуть», or what went wrong with an edit, at the bottom for `noticeTime`.
    private(set) var notice: RecordsNotice?

    /// How long the bar stays: there is no ready toast in iOS, and the project undoes instead of asking first.
    static let noticeTime: Duration = .seconds(5)

    private let feed: RecordsFeed
    private let now: @Sendable () -> Date
    private let calendar: Calendar
    private let wait: @Sendable (Duration) async -> Void

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
    /// Swiped away, the server has not answered yet: hidden, and back if the delete fails.
    private var deleting: Set<String> = []
    /// Deleted on the server since the list last started from the first page: a page read before the delete — the
    /// next one, on its way meanwhile — must not bring it back.
    private var deleted: Set<String> = []
    private var noticesShown = 0
    /// The last delete or «Вернуть» started: only its answer changes the bar.
    private var lastEdit = 0

    init(
        feed: RecordsFeed,
        now: @escaping @Sendable () -> Date = { Date() },
        calendar: Calendar = .current,
        wait: @escaping @Sendable (Duration) async -> Void = { try? await Task.sleep(for: $0) }
    ) {
        self.feed = feed
        self.now = now
        self.calendar = calendar
        self.wait = wait
    }

    /// The record behind a row, on the first page or a scrolled one.
    func record(id: String) -> Record? {
        (shown?.page.items ?? []).first { $0.id == id } ?? more.first { $0.id == id }
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
            let known = Set((shown?.page.items ?? []).map(\.id) + more.map(\.id)).union(deleted)
            more += page.items.filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
        case let .failure(failure):
            moreProblem = failure
        }
        rebuild()
    }

    // MARK: Edits (FT-221)

    /// The swipe. The row goes at once, the server deletes the record, and «Удалено · Вернуть» stays for 5 s. A delete
    /// while the bar is up takes the bar over: the record before stays deleted. Without a network the row comes back
    /// and the bar says why; deleted elsewhere already (404) — the row stays gone and the list refreshes.
    func delete(_ id: String) async {
        let edit = startEdit()
        deleting.insert(id)
        rebuild()
        do {
            try await feed.delete(id)
            deleting.remove(id)
            leave(id)
            rebuild()
            if edit == lastEdit {
                show("Удалено", restoring: id)
            }
        } catch {
            deleting.remove(id)
            if error == .recordGone {
                leave(id)
                refreshLater()
            }
            rebuild()
            if edit == lastEdit {
                show(error.message)
            }
        }
    }

    /// «Вернуть» on the bar: the record the server gives back goes to its place, on a scrolled page too. Without a
    /// network it stays deleted and the bar offers «Вернуть» again.
    func restoreDeleted() async {
        guard let id = notice?.restorable else { return }
        let edit = startEdit()
        do {
            let record = try await feed.restore(id)
            deleted.remove(id)
            shownRecords = shownRecords.restoring(record, morePagesFollow: hasMore)
            rebuild()
        } catch {
            guard edit == lastEdit else { return }
            if error == .recordGone {
                show(error.message)
                refreshLater()
            } else {
                show(error.message, restoring: id)
            }
        }
    }

    /// The categories for the sheet: not kept, since without a network they cannot be changed anyway (FT-219).
    func categories() async throws(RecordsFailure) -> [RecordCategory] {
        try await feed.categories()
    }

    /// The sheet's choice: the row takes the record as the server saved it. Only `categoryId` goes, so «проверить»
    /// stays as the server keeps it, as in the Mini App. A record deleted elsewhere leaves the list, which refreshes.
    func setCategory(_ categoryId: String, of id: String) async throws(RecordsFailure) {
        do {
            let record = try await feed.setCategory(categoryId, of: id)
            shownRecords = shownRecords.replacing(record)
            rebuild()
        } catch {
            if error == .recordGone {
                leave(id)
                rebuild()
                show(error.message)
                refreshLater()
            }
            throw error
        }
    }

    /// A new delete or «Вернуть»: the bar of the one before goes, its record stays as the server has it.
    private func startEdit() -> Int {
        lastEdit += 1
        notice = nil
        return lastEdit
    }

    /// Gone on the server: off the first page and the scrolled ones, and kept off a next page on its way.
    private func leave(_ id: String) {
        deleted.insert(id)
        shownRecords = shownRecords.removing(id)
    }

    private func refreshLater() {
        Task { await refresh() }
    }

    private func show(_ text: String, restoring id: String? = nil) {
        noticesShown += 1
        let shownNow = RecordsNotice(id: noticesShown, text: text, restorable: id)
        notice = shownNow
        Task { [wait] in
            await wait(Self.noticeTime)
            // A newer bar keeps its own 5 s
            if notice?.id == shownNow.id {
                notice = nil
            }
        }
    }

    private var shownRecords: ShownRecords {
        get { ShownRecords(first: shown?.page.items ?? [], more: more) }
        set {
            if let shown {
                self.shown = RecordsSnapshot(
                    address: shown.address,
                    page: RecordsPage(items: newValue.first, nextCursor: shown.page.nextCursor),
                    updatedAt: shown.updatedAt
                )
            }
            more = newValue.more
        }
    }

    // MARK: Refresh

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
                deleted = []
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
        // The feed's page already leaves out what was deleted, the deletes confirmed while it was on its way too
        deleted = []
        generation += 1
    }

    private func rebuild() {
        let hidden = deleting.union(deleted)
        let records = ((shown?.page.items ?? []) + more).filter { !hidden.contains($0.id) }
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

/// The bar at the bottom of «Записи» (FT-221): «Удалено» with «Вернуть», or what went wrong with an edit.
struct RecordsNotice: Equatable, Identifiable, Sendable {
    /// New for each bar: the 5 s of one bar do not end the next.
    let id: Int
    let text: String
    /// The record «Вернуть» brings back; `nil` — no button.
    let restorable: String?
}
