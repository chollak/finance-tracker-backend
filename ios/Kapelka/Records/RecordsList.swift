import Foundation
import Observation

/// The tab «Записи» (FT-220): the server's records by day, the next page while scrolling, the copy on disk without a
/// network. It refreshes when the tab opens, when the app comes back with the tab open, on a pull, and after the queue
/// wrote a record while the tab is open; never on a timer (decision 2026-10-31). The tab's own refresh on opening
/// covers the queue's records written while it was closed.
///
/// FT-221: a swipe deletes, «Вернуть» brings the record back for 5 s, the sheet changes the category. The server
/// decides each edit; without a network nothing changes and nothing waits on the phone (decision 2026-10-31).
///
/// FT-254: the refresh shows itself («Обновляю…», then how old the list is), each day has its total, «!» explains
/// itself in the sheet with «Да, верно», and a tap on «Записал: …» scrolls to the record.
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
    /// What the line over the list says; the screen renders it with the clock (`caption(at:)`).
    private(set) var status: RecordsStatus?
    /// The row to scroll to, once (`scrolled`): a tap on «Записал: …» (FT-254).
    private(set) var scroll: RecordsScroll?
    /// The row lit for a second after the scroll.
    private(set) var highlighted: String?
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
    /// «Удалено · Вернуть», or what went wrong with an edit, at the bottom for 5 s (`RecordsNoticeBar`).
    var notice: RecordsNotice? { bar.notice }
    /// The sheet of categories open now (FT-221); its own swipe down sets `nil`.
    var picker: CategoryPicker?
    /// What the server deleted and gave back through this list — a swipe or the card's «Удалить» (FT-252): the card on
    /// «Записать» shows its phrase's records as deleted, and as written again after «Вернуть».
    @ObservationIgnored var changed: @MainActor (RecordsChange) -> Void = { _ in }

    private let feed: RecordsFeed
    private let now: @Sendable () -> Date
    private let calendar: Calendar
    private let bar: RecordsNoticeBar
    /// What became of an edit, for the haptics (FT-251).
    private let feedback: @MainActor (FeedbackEvent) -> Void
    /// The queue's answer for a record written from this phone (FT-255): the guesses behind «!».
    private let answer: @Sendable (Record) async -> CapturedRecord?
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
    /// A refresh that is not a pull runs: «Обновляю…».
    private var showsRefreshing = false
    /// The record a tap asked for: shown once the refresh on its way is over.
    private var revealing: String?
    private var scrollCount = 0
    /// Swiped away, the server has not answered yet: hidden, and back if the delete fails.
    private var deleting: Set<String> = []
    /// Deleted on the server since the list last started from the first page: a page read before the delete — the
    /// next one, on its way meanwhile — must not bring it back.
    private var deleted: Set<String> = []
    /// The last delete started: only its answer offers «Вернуть».
    private var lastDelete = 0

    /// The highlight of a row a tap scrolled to.
    static let highlightTime: Duration = .seconds(1)

    /// `keepsNotices`: VoiceOver is on — the bar stays until it is closed or another edit starts.
    init(
        feed: RecordsFeed,
        now: @escaping @Sendable () -> Date = { Date() },
        calendar: Calendar = .current,
        wait: @escaping @Sendable (Duration) async -> Void = { try? await Task.sleep(for: $0) },
        keepsNotices: @escaping @MainActor () -> Bool = { false },
        feedback: @escaping @MainActor (FeedbackEvent) -> Void = { _ in },
        answer: @escaping @Sendable (Record) async -> CapturedRecord? = { _ in nil }
    ) {
        self.feed = feed
        self.now = now
        self.calendar = calendar
        bar = RecordsNoticeBar(wait: wait, keepsOpen: keepsNotices)
        self.feedback = feedback
        self.answer = answer
        self.wait = wait
    }

    /// The line over the list at this moment: «Обновляю…», «Обновлено 5 мин назад», «Нет связи · обновлено в 14:32».
    func caption(at moment: Date) -> String? {
        RecordsCaption.text(status, now: moment, calendar: calendar)
    }

    /// The line now.
    var caption: String? { caption(at: now()) }

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
    /// the pass that runs may have read the page before the call's reason — a record just sent. `pulled`: the pull
    /// shows the system's indicator, so the line over the list stays as it was; any other refresh says «Обновляю…».
    func refresh(pulled: Bool = false) async {
        await run(pulled: pulled).value
    }

    /// The same, started at once: a tap on a notification asks for its record right after, and the record waits for
    /// this refresh (`reveal`).
    func startRefresh() {
        _ = run(pulled: false)
    }

    private func run(pulled: Bool) -> Task<Void, Never> {
        refreshAgain = true
        if !pulled, !showsRefreshing {
            showsRefreshing = true
            status = .refreshing
        }
        if let refreshing {
            return refreshing
        }
        let run = Task {
            while refreshAgain {
                refreshAgain = false
                await refreshOnce()
            }
            // The last check and this run in one turn of the main actor: no call slips in between
            refreshing = nil
            showsRefreshing = false
            rebuild()
            finishReveal()
        }
        refreshing = run
        return run
    }

    // MARK: To a record (FT-254)

    /// A tap on «Записал: …»: the list scrolls to the record and lights it for a second. A refresh on its way comes
    /// first — the record may be new; off screen the tab's own refresh does. Not on the loaded pages (older, or not
    /// there without a network) — the tab opens at the top.
    func reveal(_ id: String) {
        revealing = id
        if refreshing == nil, isOnScreen {
            finishReveal()
        }
    }

    /// The screen scrolled: the same request is not applied again.
    func scrolled(_ number: Int) {
        if scroll?.number == number {
            scroll = nil
        }
    }

    private func finishReveal() {
        guard let id = revealing else { return }
        revealing = nil
        scrollCount += 1
        let number = scrollCount
        let shown = days.contains { $0.rows.contains { $0.id == id } }
        scroll = RecordsScroll(number: number, target: shown ? .record(id) : .top)
        highlighted = shown ? id : nil
        guard shown else { return }
        Task { [wait] in
            await wait(Self.highlightTime)
            // A later tap keeps its own second
            if scrollCount == number {
                highlighted = nil
            }
        }
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
    /// and the bar says why — for an older delete too; deleted elsewhere already (404) — the row stays gone and the
    /// list refreshes.
    func delete(_ id: String) async {
        let title = record(id: id).map(RecordDays.title(of:)) ?? ""
        await delete([RecordsNotice.Item(id: id, title: title)])
    }

    /// «Удалить» on the card of «Записать» (FT-252): every record of a phrase, one by one, as the swipe deletes one —
    /// «Записи» hide them, loaded or not yet. One bar «Удалено N · Вернуть» for those the server deleted; one that
    /// did not go is named on it and stays.
    func delete(_ items: [RecordsNotice.Item]) async {
        guard !items.isEmpty else { return }
        lastDelete += 1
        let started = lastDelete
        bar.takeOver()
        deleting.formUnion(items.map(\.id))
        rebuild()
        var deletedNow: [RecordsNotice.Item] = []
        var gone = false
        var failed: [(item: RecordsNotice.Item, failure: RecordsFailure)] = []
        for item in items {
            do {
                try await feed.delete(item.id)
                deletedNow.append(item)
                leave(item.id)
            } catch {
                if error == .recordGone {
                    gone = true
                    leave(item.id)
                } else {
                    failed.append((item, error))
                }
            }
            deleting.remove(item.id)
            rebuild()
        }
        let off = items.filter { item in !failed.contains { $0.item == item } }
        if !off.isEmpty {
            changed(.deleted(off.map(\.id)))
        }
        if gone {
            refreshLater()
        }
        let latest = started == lastDelete
        if latest, !deletedNow.isEmpty {
            bar.offerUndo(RecordsNotice.Undo(items: deletedNow))
        }
        guard let message = Self.deleteMessage(failed: failed, gone: gone, alone: latest && off.isEmpty) else {
            return
        }
        bar.say(message)
        feedback(.editFailed)
    }

    /// What the bar says about a delete that did not all go: the server's reason when nothing else happened and it is
    /// the latest delete, otherwise the records named.
    private static func deleteMessage(
        failed: [(item: RecordsNotice.Item, failure: RecordsFailure)],
        gone: Bool,
        alone: Bool
    ) -> String? {
        guard let first = failed.first else {
            return gone ? RecordsFailure.recordGone.message : nil
        }
        if alone { return first.failure.message }
        return "Не удалил \(RecordsNotice.Undo(items: failed.map(\.item)).what) — \(first.failure.reason)"
    }

    /// «Вернуть» on the bar: the records the server gives back go to their places, on a scrolled page too. The bar
    /// waits for the answers with the button off. Without a network a record stays deleted, and the bar says so
    /// with its own «Вернуть» — even when another delete has taken the bar meanwhile.
    func restoreDeleted() async {
        guard let undo = notice?.undo, bar.startRestoring(undo.ids) else { return }
        var restored: [String] = []
        var gone = false
        var failed: [(item: RecordsNotice.Item, failure: RecordsFailure)] = []
        var refreshes = false
        for item in undo.items {
            do {
                let record = try await feed.restore(item.id)
                let wasShown = deleted.remove(item.id) != nil
                if let placed = shownRecords.restoring(record, wasShown: wasShown, morePagesFollow: hasMore) {
                    shownRecords = placed
                } else {
                    // The list started again since the delete: a fresh start brings it on its page
                    refreshes = true
                }
                restored.append(item.id)
            } catch {
                if error == .recordGone {
                    gone = true
                } else {
                    failed.append((item, error))
                }
            }
        }
        rebuild()
        if !restored.isEmpty {
            changed(.restored(restored))
        }
        if refreshes || gone {
            refreshLater()
        }
        if let first = failed.first {
            let left = failed.map(\.item)
            bar.restoreFailed(left, message: "Не вернул \(RecordsNotice.Undo(items: left).what) — \(first.failure.reason)")
            feedback(.editFailed)
        } else if gone {
            bar.restoreGone(undo.ids, message: RecordsFailure.recordGone.message)
            feedback(.editFailed)
        } else {
            bar.restored(undo.ids)
            feedback(.editSaved)
        }
    }

    /// VoiceOver closes the bar that does not go by itself.
    func dismissNotice() {
        bar.dismiss()
    }

    /// A tap on a row: the sheet of its categories.
    func openPicker(for id: String) {
        picker = record(id: id).map { CategoryPicker(record: $0, list: self) }
    }

    /// Closes the sheet of this record only: a slow answer for one row must not close the sheet opened since for
    /// another.
    func closePicker(_ id: String) {
        if picker?.id == id {
            picker = nil
        }
    }

    /// The categories for the sheet: not kept, since without a network they cannot be changed anyway (FT-219).
    func categories() async throws(RecordsFailure) -> [RecordCategory] {
        try await feed.categories()
    }

    /// The sheet's choice: the row takes the record as the server saved it. Only `categoryId` goes, so «проверить»
    /// stays as the server keeps it, as in the Mini App. A record deleted elsewhere leaves the list, which refreshes.
    func setCategory(_ categoryId: String, of id: String) async throws(RecordsFailure) {
        try await edit(id) { [feed] () async throws(RecordsFailure) -> Record in
            try await feed.setCategory(categoryId, of: id)
        }
    }

    // MARK: «!» (FT-254)

    /// Why the record has «!»: the general phrase, and the queue's guesses under it while the record is as written.
    func review(of id: String) async -> RecordReview {
        guard let record = record(id: id) else { return RecordReview(assumed: []) }
        return RecordReview.of(record, answer: await answer(record))
    }

    /// «Да, верно»: `PUT { needsReview: false }`, the row takes the server's record — without «!» — with «успех».
    /// Without a network nothing changes; deleted elsewhere — the row goes and the list refreshes, as with the
    /// category (FT-221).
    func confirm(_ id: String) async throws(RecordsFailure) {
        try await edit(id) { [feed] () async throws(RecordsFailure) -> Record in
            try await feed.confirm(id)
        }
    }

    /// One edit of a record: the server's copy on screen; the record gone — off the list, which refreshes.
    private func edit(
        _ id: String,
        by call: () async throws(RecordsFailure) -> Record
    ) async throws(RecordsFailure) {
        do {
            let record = try await call()
            shownRecords = shownRecords.replacing(record)
            rebuild()
            feedback(.editSaved)
        } catch {
            feedback(.editFailed)
            if error == .recordGone {
                leave(id)
                rebuild()
                changed(.deleted([id]))
                // Next to «Вернуть» of a delete on its way, which keeps it when it comes
                bar.say(error.message)
                refreshLater()
            }
            throw error
        }
    }

    /// Gone on the server: off the first page and the scrolled ones, and kept off a next page on its way.
    private func leave(_ id: String) {
        deleted.insert(id)
        shownRecords = shownRecords.removing(id)
    }

    private func refreshLater() {
        Task { await refresh() }
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
        let first = shown?.page.items ?? []
        let onFirst = Set(first.map(\.id))
        // A record put back last on the disk's page and first on a scrolled one shows once
        let records = (first + more.filter { !onFirst.contains($0.id) }).filter { !hidden.contains($0.id) }
        days = RecordDays.days(
            records, accountNames: accountNames, now: now(), calendar: calendar, lastDayComplete: nextCursor == nil
        )
        status = Self.status(refreshing: showsRefreshing, problem: problem, updatedAt: shown?.updatedAt)
        screen = Self.screen(hasRecords: !records.isEmpty, answered: shown != nil, problem: problem)
    }

    private static func status(refreshing: Bool, problem: RecordsFailure?, updatedAt: Date?) -> RecordsStatus? {
        if refreshing { return .refreshing }
        if let problem { return .stale(problem, updatedAt: updatedAt) }
        return updatedAt.map(RecordsStatus.updated)
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

/// A change the server made to records through the list (FT-252), in the order of the records asked for.
enum RecordsChange: Equatable, Sendable {
    /// Deleted now, or found deleted elsewhere already (404).
    case deleted([String])
    /// Back after «Вернуть».
    case restored([String])
}

/// A scroll the screen applies once: to a record, or to the top when the record is not on the loaded pages.
struct RecordsScroll: Equatable, Sendable {
    enum Target: Equatable, Sendable {
        case record(String)
        case top
    }

    /// New for each tap: the same record twice scrolls twice.
    let number: Int
    let target: Target
}
