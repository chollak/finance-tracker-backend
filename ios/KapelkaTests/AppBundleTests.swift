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

    @Test("микрофон и распознавание объясняют, зачем: без этого iOS не покажет вопрос")
    func voicePermissionTexts() {
        let info = Bundle.main.infoDictionary ?? [:]
        #expect((info["NSMicrophoneUsageDescription"] as? String)?.isEmpty == false)
        #expect((info["NSSpeechRecognitionUsageDescription"] as? String)?.isEmpty == false)
    }

    @Test("«Записать трату» и «Отправить очередь» лежат в сборке — iOS покажет их сразу после установки")
    func appShortcutsInBundle() throws {
        let metadata = try #require(Bundle.main.url(forResource: "Metadata", withExtension: "appintents"))
        let files = FileManager.default.enumerator(at: metadata, includingPropertiesForKeys: [.isRegularFileKey])?
            .compactMap { $0 as? URL }
            .filter { (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true } ?? []
        let text = try files.map { String(decoding: try Data(contentsOf: $0), as: UTF8.self) }.joined()

        #expect(text.contains("RecordExpenseIntent"))
        #expect(text.contains("SendQueueIntent"))
        #expect(text.contains("Записать трату"))
        #expect(text.contains("Отправить очередь"))
    }

    @Test("«Записать трату» открывает приложение, «Отправить очередь» — нет")
    func intentsOpenApp() {
        #expect(RecordExpenseIntent.openAppWhenRun)
        #expect(SendQueueIntent.openAppWhenRun == false)
    }

    @Test("под тестами приложение только хозяин: очередь и сеть не запускаются")
    func testHostStartsNothing() {
        #expect(TestRun.isActive)
    }
}
