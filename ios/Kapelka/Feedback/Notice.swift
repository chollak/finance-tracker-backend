import Foundation

/// Where a tap on a notification opens the app (FT-253): a tab or the settings.
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

/// A place and, in «Записи», the record to scroll to and light (FT-254) — a notification about one record, and the
/// card of FT-252.
struct OpenTarget: Equatable, Sendable {
    /// The key of `userInfo` the record's id travels under, next to the place.
    static let recordKey = "record"

    let place: AppPlace
    /// Only `.records` uses it.
    let record: String?

    init(_ place: AppPlace, record: String? = nil) {
        self.place = place
        self.record = record
    }

    /// What a notification names; one from before FT-254 names the place alone.
    init?(userInfo: [AnyHashable: Any]) {
        guard let place = AppPlace(userInfo: userInfo) else { return nil }
        self.init(place, record: userInfo[Self.recordKey] as? String)
    }

    var userInfo: [AnyHashable: Any] {
        var info = place.userInfo
        if let record {
            info[Self.recordKey] = record
        }
        return info
    }
}

/// One notification: under what id, what it says, where a tap opens. A notice under an id already shown replaces it:
/// a late payment's «Записал: …» takes the place of its «уйдёт позже» (id — the payment's `clientId`).
struct Notice: Equatable, Sendable {
    let id: String
    let body: String
    let opens: AppPlace
    /// The one record it is about: a tap scrolls to it in «Записи» (FT-254).
    let record: String?

    init(id: String, body: String, opens: AppPlace, record: String? = nil) {
        self.id = id
        self.body = body
        self.opens = opens
        self.record = record
    }

    var userInfo: [AnyHashable: Any] {
        OpenTarget(opens, record: record).userInfo
    }
}

/// `UNUserNotificationCenter` behind a seam for the tests (`SystemNoticeCenter`). Neither call throws: without
/// permission iOS drops the notice, and the records are on the phone and on the server all the same.
protocol NoticeCenter: Sendable {
    func add(_ notice: Notice) async
    /// Takes these off the notification centre, and any not shown yet.
    func remove(_ ids: [String]) async
}
