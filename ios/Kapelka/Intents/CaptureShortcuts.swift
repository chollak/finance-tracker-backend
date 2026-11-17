import AppIntents
import Observation

/// «Записать трату» asked the app to listen. The main screen starts once it is on screen and active — on a cold
/// launch that comes after the command has run.
@MainActor
@Observable
final class ListenRequest {
    static let shared = ListenRequest()

    private(set) var isPending = false
    /// The journal's runs of the presses not taken yet (#241): the screen goes on with them (`ExpenseRuns`).
    @ObservationIgnored private var runs: [UUID] = []

    func ask(run: UUID? = nil) {
        if let run {
            runs.append(run)
        }
        isPending = true
    }

    /// `true` once per request.
    func take() -> Bool {
        guard isPending else { return false }
        isPending = false
        return true
    }

    /// The runs behind the request just taken; each once.
    func takeRuns() -> [UUID] {
        defer { runs = [] }
        return runs
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
        await Self.ask(journal: AppServices.shared.journal, request: .shared)
        return .result()
    }

    /// The run starts here and goes on on the screen (`ExpenseRuns`): the command itself only asks to listen.
    @MainActor
    static func ask(journal: CommandJournal, request: ListenRequest) async {
        let run = await journal.begin(.recordExpense)
        await journal.step(run, JournalText.waitingForScreen)
        request.ask(run: run)
        // The screen goes on with the run; that iOS cancelled the command itself shows here
        if Task.isCancelled {
            await journal.step(run, JournalText.cancelled)
        }
    }
}

/// «Отправить очередь» for automations like «подключился к домашнему Wi-Fi»: sends what waits on the phone without
/// opening the app, within the time iOS gives a command. It answers with its dialog, so what it sends posts no
/// notification (FT-253); a payment's «уйдёт позже» it sent is taken off. The work is `SendQueueCommand`.
struct SendQueueIntent: AppIntent {
    static var title: LocalizedStringResource { "Отправить очередь" }
    static var description: IntentDescription {
        IntentDescription("Отправляет записи, которые ждут на телефоне. Удобно для автоматизации «Wi-Fi дома».")
    }
    static var openAppWhenRun: Bool { false }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let report = await AppServices.shared.sendQueue.run()
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
/// «Выполнять сразу» needs no tap; the payment is on the phone before anything is sent, its result a notification.
///
/// The amount comes as a number and «Код валюты» as text (#398), never as the text «28 000,00 UZS»: Shortcuts make that
/// text themselves and crash on it (SIGABRT in `WFCurrencyAmountContentItem`'s string coercion) when Wallet has no
/// amount yet, before the command runs. To a number field they give 0 then. A currency amount field
/// (`IntentCurrencyAmount`) would get the same number — Shortcuts make it a `Double` for both — but not Wallet's
/// currency: its code is the field's own, or none. The old text field keeps its key `amount`, so an automation not set up
/// again still works as before.
struct RecordPaymentIntent: AppIntent {
    static var title: LocalizedStringResource { "Записать оплату" }
    static var description: IntentDescription {
        IntentDescription("Для автоматизации «Транзакция» (на iOS 26 — «Wallet»): записывает оплату Apple Pay.")
    }
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "Сумма", description: "«Ввод команды» → «Сумма».")
    var amountNumber: Double?

    @Parameter(
        title: "Код валюты",
        description: "«Ввод команды» → «Тип»: «Сумма в валюте» → «Код валюты». Без него — валюта карты в настройках Kapelka."
    )
    var amountCurrency: String?

    @Parameter(title: "Магазин", description: "«Ввод команды» → продавец.")
    var merchant: String?

    @Parameter(title: "Карта", description: "«Ввод команды» → карта. Счёт для неё — в настройках Kapelka.")
    var card: String?

    @Parameter(
        title: "Валюта",
        description: "Только если Wallet не дал кода валюты и все карты автоматизации в одной валюте. Иначе — валюта карты в настройках Kapelka."
    )
    var currency: PaymentCurrency?

    @Parameter(
        title: "Сумма текстом (старое)",
        description: "Прежнее поле — очисти его: с суммой текстом быстрые команды падают, когда Wallet ещё не знает суммы."
    )
    var amount: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Записать оплату \(\.$amountNumber) \(\.$amountCurrency) в \(\.$merchant) с карты \(\.$card)") {
            \.$currency
            \.$amount
        }
    }

    var input: PaymentInput {
        PaymentInput(
            amount: amount,
            amountNumber: amountNumber,
            amountCurrency: amountCurrency,
            currency: currency,
            merchant: merchant,
            card: card
        )
    }

    /// No dialog and no output value: the automation must need no tap (Shukur's decision of 2026-10-30). A dialog waits
    /// for «Готово» after each payment, a value makes iOS ask «Allow … to output» when another app runs the command.
    /// The result comes as a notification that goes away by itself.
    func perform() async throws -> some IntentResult {
        try await AppServices.shared.payments.record(input)
        return .result()
    }
}

extension PaymentCurrency: AppEnum {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Валюта" }
    static var caseDisplayRepresentations: [PaymentCurrency: DisplayRepresentation] {
        [.uzs: "Сум", .usd: "Доллар"]
    }
}
