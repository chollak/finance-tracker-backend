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
            intent: RecordPaymentIntent(),
            phrases: [
                "Записать оплату в \(.applicationName)",
                "\(.applicationName), записать оплату",
            ],
            shortTitle: "Записать оплату",
            systemImageName: "creditcard"
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

/// «Записать оплату» for the Wallet automation «Транзакция» (FT-179). iOS lets no app create that automation: it is set
/// up once by hand (the settings show how), each field taken from «Ввод команды». Runs without opening the app, so
/// «Выполнять сразу» needs no tap; the payment is on the phone before anything is sent.
struct RecordPaymentIntent: AppIntent {
    static var title: LocalizedStringResource { "Записать оплату" }
    static var description: IntentDescription {
        IntentDescription("Для автоматизации «Транзакция» (на iOS 26 — «Wallet»): записывает оплату Apple Pay.")
    }
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "Сумма", description: "«Ввод команды» → сумма, как её даёт Wallet: «28 000,00 UZS».")
    var amount: String?

    @Parameter(title: "Магазин", description: "«Ввод команды» → продавец.")
    var merchant: String?

    @Parameter(title: "Карта", description: "«Ввод команды» → карта. Счёт для неё — в настройках Kapelka.")
    var card: String?

    @Parameter(title: "Валюта", description: "Только если в сумме нет валюты.")
    var currency: PaymentCurrency?

    static var parameterSummary: some ParameterSummary {
        Summary("Записать оплату \(\.$amount) в \(\.$merchant) с карты \(\.$card)") {
            \.$currency
        }
    }

    /// Only a dialog, no output value: a value makes iOS ask «Allow … to output» when another app runs the command,
    /// and the automation must need no tap.
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let input = PaymentInput(amount: amount, currency: currency, merchant: merchant, card: card)
        let answer = try await AppServices.shared.payments.record(input)
        return .result(dialog: IntentDialog(stringLiteral: answer))
    }
}

extension PaymentCurrency: AppEnum {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Валюта" }
    static var caseDisplayRepresentations: [PaymentCurrency: DisplayRepresentation] {
        [.uzs: "Сум", .usd: "Доллар"]
    }
}
