import Foundation
import Observation

/// The bar at the bottom of «Записи» (FT-221): «Удалено» with «Вернуть», what went wrong with an edit, or both.
struct RecordsNotice: Equatable, Identifiable, Sendable {
    /// The record «Вернуть» brings back.
    struct Undo: Equatable, Sendable {
        let id: String
        /// The row's title, for «Не вернул «такси» — нет связи».
        let title: String
        /// «Вернуть» is on its way: the button is off until the server answers.
        var isRestoring = false
    }

    /// New for each bar: the 5 s of one bar do not end the next.
    let id: Int
    let undo: Undo?
    /// What went wrong with an edit; over «Удалено · Вернуть» when there is both.
    let message: String?

    var restorable: String? { undo?.id }

    /// The whole bar in one line: what VoiceOver says.
    var text: String {
        [message, undo == nil ? nil : "Удалено"].compactMap { $0 }.joined(separator: ". ")
    }
}

/// What the bar shows and for how long. There is no ready toast in iOS, and the project undoes instead of asking first
/// (decision 2026-10-31). Rules (review of PR #161):
/// - a new delete takes the bar over: the record before stays deleted;
/// - a message joins the bar instead of replacing «Вернуть», and «Вернуть» of a delete confirmed later keeps it;
/// - «Вернуть» on its way keeps the bar, and its failure always shows, with its own «Вернуть»;
/// - each bar goes after 5 s; with VoiceOver on it stays until it is closed or another edit starts.
@MainActor
@Observable
final class RecordsNoticeBar {
    static let time: Duration = .seconds(5)

    private(set) var notice: RecordsNotice?

    private let wait: @Sendable (Duration) async -> Void
    private let keepsOpen: @MainActor () -> Bool
    private var shownCount = 0

    init(wait: @escaping @Sendable (Duration) async -> Void, keepsOpen: @escaping @MainActor () -> Bool) {
        self.wait = wait
        self.keepsOpen = keepsOpen
    }

    /// A new delete: the bar of the one before goes.
    func takeOver() {
        notice = nil
    }

    /// The delete went through: «Удалено · Вернуть», with what the bar says already.
    func offerUndo(_ undo: RecordsNotice.Undo) {
        put(undo: undo, message: notice?.message)
    }

    /// Next to «Вернуть» if the bar offers it.
    func say(_ message: String) {
        put(undo: notice?.undo, message: message)
    }

    /// `false` when the bar does not offer this record or its «Вернуть» is on its way already.
    func startRestoring(_ id: String) -> Bool {
        guard var undo = notice?.undo, undo.id == id, !undo.isRestoring else { return false }
        undo.isRestoring = true
        put(undo: undo, message: nil)
        return true
    }

    /// Back on the server: its «Вернуть» goes; a message that came meanwhile stays.
    func restored(_ id: String) {
        guard notice?.undo?.id == id else { return }
        put(undo: nil, message: notice?.message)
    }

    /// Never lost to a newer bar: the record stays deleted unless this one brings it back.
    func restoreFailed(_ undo: RecordsNotice.Undo, message: String) {
        put(undo: RecordsNotice.Undo(id: undo.id, title: undo.title), message: message)
    }

    /// Gone on the server: nothing to bring back.
    func restoreGone(_ id: String, message: String) {
        put(undo: notice?.undo?.id == id ? nil : notice?.undo, message: message)
    }

    /// Closed with VoiceOver («Закрыть» or the escape gesture).
    func dismiss() {
        notice = nil
    }

    private func put(undo: RecordsNotice.Undo?, message: String?) {
        guard undo != nil || message != nil else {
            notice = nil
            return
        }
        shownCount += 1
        let shownNow = RecordsNotice(id: shownCount, undo: undo, message: message)
        notice = shownNow
        Task { [wait] in
            await wait(Self.time)
            // A newer bar keeps its own 5 s; «Вернуть» on its way waits for the answer
            guard notice?.id == shownNow.id, shownNow.undo?.isRestoring != true, !keepsOpen() else { return }
            notice = nil
        }
    }
}
