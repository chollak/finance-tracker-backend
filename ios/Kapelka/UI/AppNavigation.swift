import Observation

/// The two tabs and the settings sheet over them (FT-220).
@MainActor
@Observable
final class AppNavigation {
    enum Tab: Hashable {
        /// «Записать»: the microphone, the field, what in the queue needs attention.
        case capture
        /// «Записи»: the server's records by day.
        case records
    }

    var tab: Tab = .capture
    var showsSettings = false

    private let listenRequest: ListenRequest

    init(listenRequest: ListenRequest = .shared) {
        self.listenRequest = listenRequest
    }

    /// «Записать трату» from the Action Button: `true` once per press when the microphone should start now — with
    /// «Записать» open, whichever tab was. It waits while the app is not active (the microphone does not start in the
    /// background) or the settings are open: they may hold an address or a token not saved yet.
    func takeListenRequest(sceneActive: Bool) -> Bool {
        guard sceneActive, !showsSettings, listenRequest.take() else { return false }
        tab = .capture
        return true
    }

    /// Observed by the screen: a press of the Action Button while the app is open.
    var listenPending: Bool { listenRequest.isPending }

    /// «Записи» is seen: it refreshes on opening, on coming back to the app and when the settings close — the
    /// address or the token may be new.
    func recordsOnScreen(sceneActive: Bool) -> Bool {
        sceneActive && tab == .records && !showsSettings
    }

    /// The first launch opens the settings; «Записать трату» before the address is set listens first, and the queue
    /// keeps the phrase until the settings are in.
    func appeared(isConfigured: Bool) {
        if !isConfigured, !listenRequest.isPending {
            showsSettings = true
        }
    }
}
