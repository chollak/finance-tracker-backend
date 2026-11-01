import Observation
import SwiftUI

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
    private let openRequest: OpenRequest

    init(listenRequest: ListenRequest = .shared, openRequest: OpenRequest = .shared) {
        self.listenRequest = listenRequest
        self.openRequest = openRequest
    }

    /// A tap on a notification (FT-253): its tab, or the settings over the tab that was open. A tab opens under the
    /// settings if they are open: they may hold an address or a token not saved yet. Returns the record «Записи»
    /// should scroll to (FT-254), if the tap names one.
    @discardableResult
    func takeOpenRequest() -> String? {
        guard let target = openRequest.take() else { return nil }
        switch target.place {
        case .capture: tab = .capture
        case .records: tab = .records
        case .settings: showsSettings = true
        }
        return target.place == .records ? target.record : nil
    }

    /// Observed by the screen: a tap on a notification while the app is open or opening.
    var openPending: OpenTarget? { openRequest.target }

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
    /// address or the token may be new. Only the background takes it off screen: the notification shade, Control
    /// Center or the app switcher over the app make it `.inactive`, and the list under them must not refresh — two
    /// requests and the scrolled pages gone each time. The microphone still waits for `.active`.
    func recordsOnScreen(scenePhase: ScenePhase) -> Bool {
        scenePhase != .background && tab == .records && !showsSettings
    }

    /// The first launch opens the settings; «Записать трату» before the address is set listens first, and the queue
    /// keeps the phrase until the settings are in.
    func appeared(isConfigured: Bool) {
        if !isConfigured, !listenRequest.isPending {
            showsSettings = true
        }
    }
}
