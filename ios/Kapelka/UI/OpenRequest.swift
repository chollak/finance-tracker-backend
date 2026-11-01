import Observation

/// A tap on a notification asked to open a place (FT-253), as `ListenRequest` asks to listen. The tap may come before
/// the screen exists — a cold launch — so the request waits until `AppNavigation` takes it.
@MainActor
@Observable
final class OpenRequest {
    static let shared = OpenRequest()

    /// The last tap wins: only one place can be open.
    private(set) var place: AppPlace?

    func ask(_ place: AppPlace) {
        self.place = place
    }

    /// The place once per request.
    func take() -> AppPlace? {
        defer { place = nil }
        return place
    }
}
