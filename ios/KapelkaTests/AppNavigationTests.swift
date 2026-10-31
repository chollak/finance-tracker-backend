import SwiftUI
import Testing
@testable import Kapelka

/// Two tabs (FT-220): «Записать трату» from the Action Button always lands on «Записать» and listens, whichever tab
/// the app was on; «Записи» counts as on screen only while its tab is open in the active app.
@MainActor
@Suite("Вкладки")
struct AppNavigationTests {
    private let request = ListenRequest()

    @Test("«Записать трату» с вкладки «Записи» — открывает «Записать» и слушает, один раз")
    func listenFromRecords() {
        let navigation = AppNavigation(listenRequest: request)
        navigation.tab = .records
        request.ask()

        #expect(navigation.takeListenRequest(sceneActive: true))
        #expect(navigation.tab == .capture)
        #expect(request.isPending == false)
        #expect(navigation.takeListenRequest(sceneActive: true) == false)
    }

    @Test("с вкладки «Записать» — слушает там же")
    func listenFromCapture() {
        let navigation = AppNavigation(listenRequest: request)
        request.ask()

        #expect(navigation.takeListenRequest(sceneActive: true))
        #expect(navigation.tab == .capture)
    }

    @Test("пока открыты настройки или приложение не на экране — просьба ждёт")
    func waitsForScreen() {
        let navigation = AppNavigation(listenRequest: request)
        navigation.tab = .records
        request.ask()

        navigation.showsSettings = true
        #expect(navigation.takeListenRequest(sceneActive: true) == false)
        navigation.showsSettings = false
        #expect(navigation.takeListenRequest(sceneActive: false) == false)
        #expect(request.isPending)
        #expect(navigation.tab == .records)

        #expect(navigation.takeListenRequest(sceneActive: true))
        #expect(navigation.tab == .capture)
    }

    @Test("без просьбы ничего не меняется")
    func noRequest() {
        let navigation = AppNavigation(listenRequest: request)
        navigation.tab = .records
        #expect(navigation.takeListenRequest(sceneActive: true) == false)
        #expect(navigation.tab == .records)
    }

    @Test("«Записи» на экране — своя вкладка, приложение не в фоне, шторки настроек поверх нет")
    func recordsOnScreen() {
        let navigation = AppNavigation(listenRequest: request)
        #expect(navigation.recordsOnScreen(scenePhase: .active) == false)
        navigation.tab = .records
        #expect(navigation.recordsOnScreen(scenePhase: .active))
        // Пункт управления, шторка уведомлений, переключатель приложений: список под ними на экране
        #expect(navigation.recordsOnScreen(scenePhase: .inactive))
        #expect(navigation.recordsOnScreen(scenePhase: .background) == false)
        // Closing the settings refreshes: the address or the token may be new
        navigation.showsSettings = true
        #expect(navigation.recordsOnScreen(scenePhase: .active) == false)
    }

    @Test("обновляет только возврат из фона, а не шторка или Пункт управления поверх приложения")
    func refreshOnlyAfterBackground() throws {
        let navigation = AppNavigation(listenRequest: request)
        navigation.tab = .records
        let list = try RecordsList(feed: RecordsHarness().makeFeed())
        let refreshes = { (phases: [ScenePhase]) in
            phases.filter { list.setOnScreen(navigation.recordsOnScreen(scenePhase: $0)) }.count
        }

        // Opened the tab, then the shade and Control Center came and went
        #expect(refreshes([.active, .inactive, .active, .inactive, .active]) == 1)
        // Home, then back to the app
        #expect(refreshes([.inactive, .background, .inactive, .active]) == 1)
    }

    @Test("первый запуск без адреса открывает настройки — если не просили слушать")
    func firstLaunch() {
        let unset = AppNavigation(listenRequest: request)
        unset.appeared(isConfigured: false)
        #expect(unset.showsSettings)

        let configured = AppNavigation(listenRequest: ListenRequest())
        configured.appeared(isConfigured: true)
        #expect(configured.showsSettings == false)

        // «Записать трату» before the address is set: listen first, the queue keeps the phrase
        let asked = ListenRequest()
        asked.ask()
        let listening = AppNavigation(listenRequest: asked)
        listening.appeared(isConfigured: false)
        #expect(listening.showsSettings == false)
    }
}
