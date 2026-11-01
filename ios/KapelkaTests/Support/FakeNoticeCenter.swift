import Foundation
@testable import Kapelka

/// iOS's notification center as the test sees it (FT-253): every notice added and every id taken off, and what the
/// notification centre shows now — a notice added under an id it already shows replaces it there.
actor FakeNoticeCenter: NoticeCenter {
    private(set) var added: [Notice] = []
    private(set) var removed: [String] = []
    /// Notices given up because the caller was cancelled: a center that stops work on cancellation.
    private(set) var droppedOnCancel = 0
    private var shown: [Notice] = []
    private let addTakes: Duration

    /// `addTakes`: how long each `add` takes — a center that does not answer.
    init(addTakes: Duration = .zero) {
        self.addTakes = addTakes
    }

    /// What the notification centre shows, oldest first.
    var delivered: [Notice] { shown }

    var texts: [String] { added.map(\.body) }

    func add(_ notice: Notice) async {
        if addTakes > .zero {
            try? await Task.sleep(for: addTakes)
        }
        guard !Task.isCancelled else {
            droppedOnCancel += 1
            return
        }
        added.append(notice)
        shown.removeAll { $0.id == notice.id }
        shown.append(notice)
    }

    func remove(_ ids: [String]) async {
        removed += ids
        shown.removeAll { ids.contains($0.id) }
    }
}

/// `UserDefaults` of one test, removed with it.
final class TestDefaults: @unchecked Sendable {
    let name = "kapelka-tests-notices-\(UUID().uuidString)"
    let defaults: UserDefaults

    init() {
        defaults = UserDefaults(suiteName: name)!
    }

    deinit {
        UserDefaults.standard.removePersistentDomain(forName: name)
    }
}
