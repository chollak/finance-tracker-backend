import Foundation

/// Where a tap on a notification opens the app (FT-253): a tab or the settings. FT-254 adds the record to scroll to.
enum AppPlace: String, Equatable, Sendable {
    /// «Записать»: what in the queue needs attention.
    case capture
    /// «Записи»: the server's records.
    case records
    case settings

    /// The key of `userInfo` the place travels under.
    static let userInfoKey = "opens"

    /// The place a notification names; one from before FT-253 names none.
    init?(userInfo: [AnyHashable: Any]) {
        guard let raw = userInfo[Self.userInfoKey] as? String else { return nil }
        self.init(rawValue: raw)
    }

    var userInfo: [AnyHashable: Any] {
        [Self.userInfoKey: rawValue]
    }
}

/// One notification: under what id, what it says, where a tap opens. A notice under an id already shown replaces it:
/// a late payment's «Записал: …» takes the place of its «уйдёт позже» (id — the payment's `clientId`).
struct Notice: Equatable, Sendable {
    let id: String
    let body: String
    let opens: AppPlace
}

/// `UNUserNotificationCenter` behind a seam for the tests (`SystemNoticeCenter`). Neither call throws: without
/// permission iOS drops the notice, and the records are on the phone and on the server all the same.
protocol NoticeCenter: Sendable {
    func add(_ notice: Notice) async
    /// Takes these off the notification centre, and any not shown yet.
    func remove(_ ids: [String]) async
}
