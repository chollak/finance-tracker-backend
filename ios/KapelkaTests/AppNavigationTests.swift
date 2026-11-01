import SwiftUI
import Testing
import UserNotifications
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

    // MARK: A tap on a notification (FT-253)

    @Test("нажатие на уведомление: «Записи», «Записать» или настройки — один раз")
    func openFromNotice() {
        let open = OpenRequest()
        let navigation = AppNavigation(listenRequest: request, openRequest: open)

        open.ask(.records)
        #expect(navigation.openPending == OpenTarget(.records))
        #expect(navigation.takeOpenRequest() == nil)
        #expect(navigation.tab == .records)
        #expect(navigation.openPending == nil)

        open.ask(.capture)
        navigation.takeOpenRequest()
        #expect(navigation.tab == .capture)

        open.ask(.settings)
        navigation.takeOpenRequest()
        #expect(navigation.showsSettings)
        #expect(navigation.tab == .capture)

        // Taken once: nothing changes without a new tap
        navigation.showsSettings = false
        navigation.takeOpenRequest()
        #expect(navigation.showsSettings == false)
    }

    @Test("последнее нажатие важнее прежнего, пока экран его не взял")
    func lastTapWins() {
        let open = OpenRequest()
        let navigation = AppNavigation(listenRequest: request, openRequest: open)

        open.ask(.settings)
        open.ask(.records)
        navigation.takeOpenRequest()

        #expect(navigation.tab == .records)
        #expect(navigation.showsSettings == false)
    }

    @Test("уведомление несёт, куда открыть; чужое или старое (FT-179, без места) — никуда")
    func placeOfNotice() {
        #expect(AppPlace(userInfo: [AppPlace.userInfoKey: "records"]) == .records)
        #expect(AppPlace(userInfo: [AppPlace.userInfoKey: "capture"]) == .capture)
        #expect(AppPlace(userInfo: [AppPlace.userInfoKey: "settings"]) == .settings)
        #expect(AppPlace(userInfo: [:]) == nil)
        #expect(AppPlace(userInfo: [AppPlace.userInfoKey: "shop"]) == nil)
        #expect(AppPlace(userInfo: [AppPlace.userInfoKey: 1]) == nil)
        #expect(AppPlace.records.userInfo[AppPlace.userInfoKey] as? String == "records")
    }

    @Test("нажатие на «Записал: …» — «Записи» и запись, к которой перейти (FT-254); у других мест записи нет")
    func openRecord() {
        let open = OpenRequest()
        let navigation = AppNavigation(listenRequest: request, openRequest: open)

        open.ask(.records, record: "rec-1")
        #expect(navigation.openPending == OpenTarget(.records, record: "rec-1"))
        #expect(navigation.takeOpenRequest() == "rec-1")
        #expect(navigation.tab == .records)
        #expect(navigation.takeOpenRequest() == nil)

        open.ask(.capture, record: "rec-2")
        #expect(navigation.takeOpenRequest() == nil)
        #expect(navigation.tab == .capture)
    }

    @Test("нажатие на запись карточки «Записать» — тот же запрос: «Записи» и эта запись (FT-252)")
    func cardOpensItsRecord() throws {
        let open = OpenRequest()
        let navigation = AppNavigation(listenRequest: request, openRequest: open)
        var capture = Capture(clientId: UUID(), text: "кофе 45", capturedAt: Date(), timeZoneIdentifier: "Asia/Tashkent")
        capture.state = .sent
        capture.attempts = 1
        capture.reply = try CaptureReplyBodies.reply(CaptureReplyBodies.coffee)
        var state = QueueState()
        state.captures = [capture]
        let card = LastPhrase.of(state, LastPhrase.Context(configured: true, now: Date(), calendar: .current))
        let target = try #require(card?.lines.first?.opens)

        navigation.open(target)

        #expect(navigation.openPending == OpenTarget(.records, record: CaptureReplyBodies.coffeeId))
        #expect(navigation.takeOpenRequest() == CaptureReplyBodies.coffeeId)
        #expect(navigation.tab == .records)
    }

    @Test("запись едет в userInfo уведомления рядом с местом; без неё и у старых — только место")
    func recordInUserInfo() {
        let notice = Notice(id: "wrote-x", body: "Записал: кофе", opens: .records, record: "rec-1")
        #expect(notice.userInfo[AppPlace.userInfoKey] as? String == "records")
        #expect(notice.userInfo[OpenTarget.recordKey] as? String == "rec-1")
        #expect(OpenTarget(userInfo: notice.userInfo) == OpenTarget(.records, record: "rec-1"))

        let plain = Notice(id: "kapelka.token", body: "…", opens: .settings)
        #expect(plain.userInfo[OpenTarget.recordKey] == nil)
        #expect(OpenTarget(userInfo: plain.userInfo) == OpenTarget(.settings))
        #expect(OpenTarget(userInfo: [AppPlace.userInfoKey: "records"]) == OpenTarget(.records))
        #expect(OpenTarget(userInfo: [AppPlace.userInfoKey: "records", OpenTarget.recordKey: 7]) == OpenTarget(.records))
        #expect(OpenTarget(userInfo: [:]) == nil)
    }

    @Test("открытое приложение уведомлений не показывает; шторка, Wallet, фон — баннер и список")
    func presentation() {
        #expect(NoticePresenter.presentation(onScreen: true) == [])
        #expect(NoticePresenter.presentation(onScreen: false) == [.banner, .list])
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
