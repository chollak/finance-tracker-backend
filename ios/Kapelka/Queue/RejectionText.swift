/// Why the server refused a record (400), in Russian for the list. The queue keeps the server's own text: it is what
/// to look for in the server's log.
enum RejectionText {
    static let fallback = "сервер не принял запись"

    /// The messages of `docs/QUICK_CAPTURE_API.md`, «Errors» and «Payment errors», by their start.
    private static let known: [(prefix: String, shown: String)] = [
        ("capturedAt is older than", "старше 30 дней — сервер такие не берёт, запиши в Mini App"),
        ("capturedAt must be", "сервер не понял время ввода"),
        ("Text is too long", "длиннее \(CaptureText.maxLength) символов"),
        ("Text is required", "пустая фраза"),
        // A payment's fields (FT-176, «Payment errors»)
        ("amount must be", "сервер не понял сумму"),
        ("Amount must be at least", "сумма меньше 0,01"),
        ("Amount must be no more than", "больше 1 000 000 000 — сервер такую запись не берёт"),
        ("currency must be", "сервер пишет только сумы и доллары"),
        ("merchant must be", "название магазина длиннее \(Payment.merchantLimit) символов"),
        ("accountName must be", "имя счёта длиннее 100 символов — поправь в настройках Kapelka"),
        ("No visible account", "в Kapelka все счета скрыты — открой счёт в Mini App"),
    ]

    static func shown(for server: String?) -> String {
        guard let server else { return fallback }
        if let match = known.first(where: { server.hasPrefix($0.prefix) }) {
            return match.shown
        }
        // A Russian text is the server's or the queue's own; anything else in English means nothing on the screen
        let isRussian = server.unicodeScalars.contains { (0x0400...0x04FF).contains($0.value) }
        return isRussian ? server : fallback
    }
}
