import Observation

/// A tap on a notification asked to open a place (FT-253), as `ListenRequest` asks to listen; in «Записи» — with the
/// record to scroll to (FT-254). The tap may come before the screen exists — a cold launch — so the request waits until
/// `AppNavigation` takes it.
@MainActor
@Observable
final class OpenRequest {
    static let shared = OpenRequest()

    /// The last tap wins: only one place can be open.
    private(set) var target: OpenTarget?

    func ask(_ target: OpenTarget) {
        self.target = target
    }

    func ask(_ place: AppPlace, record: String? = nil) {
        ask(OpenTarget(place, record: record))
    }

    /// The target once per request.
    func take() -> OpenTarget? {
        defer { target = nil }
        return target
    }
}
