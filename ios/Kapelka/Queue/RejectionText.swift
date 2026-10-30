/// Why the server refused a record (400), in Russian for the list. The queue keeps the server's own text: it is what
/// to look for in the server's log.
enum RejectionText {
    static let fallback = "сервер не принял запись"

    /// The messages of `docs/QUICK_CAPTURE_API.md`, «Errors», by their start.
    private static let known: [(prefix: String, shown: String)] = [
        ("capturedAt is older than", "старше 30 дней — сервер такие не берёт, запиши в Mini App"),
        ("capturedAt must be", "сервер не понял время ввода"),
        ("Text is too long", "длиннее \(CaptureText.maxLength) символов"),
        ("Text is required", "пустая фраза"),
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
