import Foundation
import Testing
@testable import Kapelka

/// The app's own Info.plist: the tests run inside the app, so `Bundle.main` is Kapelka.app.
@Suite("Сборка приложения")
struct AppBundleTests {
    @Test("фоновая отправка разрешена: id задачи и режим fetch")
    func backgroundRefreshRegistered() {
        let info = Bundle.main.infoDictionary ?? [:]
        let identifiers = info["BGTaskSchedulerPermittedIdentifiers"] as? [String] ?? []
        let modes = info["UIBackgroundModes"] as? [String] ?? []

        #expect(identifiers == [BackgroundSend.taskIdentifier])
        #expect(modes.contains("fetch"))
    }

    @Test("в Info.plist нет токена и ничего похожего")
    func noSecretsInInfoPlist() {
        let keys = (Bundle.main.infoDictionary ?? [:]).keys
        #expect(!keys.contains { $0.localizedCaseInsensitiveContains("token") })
    }
}
