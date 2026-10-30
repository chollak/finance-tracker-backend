import AppIntents
import Observation

/// «Записать трату» asked the app to listen. The main screen starts once it is on screen and active — on a cold
/// launch that comes after the command has run.
@MainActor
@Observable
final class ListenRequest {
    static let shared = ListenRequest()

    private(set) var isPending = false

    func ask() {
        isPending = true
    }

    /// `true` once per request.
    func take() -> Bool {
        guard isPending else { return false }
        isPending = false
        return true
    }
}

/// «Записать трату» for the Action Button: opens the app already listening (FT-178).
struct RecordExpenseIntent: AppIntent {
    static var title: LocalizedStringResource { "Записать трату" }
    static var description: IntentDescription {
        IntentDescription("Открывает Kapelka и сразу слушает. Скажи трату — после паузы она записана.")
    }
    static var openAppWhenRun: Bool { true }

    @MainActor
    func perform() async throws -> some IntentResult {
        ListenRequest.shared.ask()
        return .result()
    }
}

/// «Отправить очередь» for automations like «подключился к домашнему Wi-Fi»: sends what waits on the phone without
/// opening the app, within the time iOS gives a command.
struct SendQueueIntent: AppIntent {
    static var title: LocalizedStringResource { "Отправить очередь" }
    static var description: IntentDescription {
        IntentDescription("Отправляет записи, которые ждут на телефоне. Удобно для автоматизации «Wi-Fi дома».")
    }
    static var openAppWhenRun: Bool { false }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let services = AppServices.shared
        await services.background.run()
        let report = QueueStatus.afterSending(
            await services.queue.state(),
            configured: services.settings.configuration() != nil
        )
        return .result(dialog: IntentDialog(stringLiteral: report))
    }
}

/// Ready in Shortcuts and in the Action Button's list as soon as the app is installed — nothing to build by hand.
struct KapelkaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RecordExpenseIntent(),
            phrases: [
                "Записать трату в \(.applicationName)",
                "\(.applicationName), записать трату",
            ],
            shortTitle: "Записать трату",
            systemImageName: "mic"
        )
        AppShortcut(
            intent: SendQueueIntent(),
            phrases: [
                "Отправить очередь \(.applicationName)",
                "\(.applicationName), отправить очередь",
            ],
            shortTitle: "Отправить очередь",
            systemImageName: "arrow.up.circle"
        )
    }
}
