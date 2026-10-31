import Foundation

/// The one line «Записать оплату» posts as a notification once it has tried to send its payment (FT-179). Shukur's
/// decision of 2026-10-30: no dialog with «Готово» after each payment — a notification goes away by itself, and the
/// result stays in the Kapelka list and in the Mini App.
enum PaymentNotice {
    /// What was written, as the server summed it up; otherwise what Wallet gave and what became of it.
    static func text(for capture: Capture, _ state: QueueState, configured: Bool) -> String {
        let line = capture.payment?.line ?? "Оплата Apple Pay"
        switch capture.state {
        case .sent:
            guard let summary = capture.reply?.summary, !summary.isEmpty else { return "\(line) — записано" }
            return capture.reply?.status == "needs_review" ? "\(summary) — проверь в Mini App" : summary
        case .rejected:
            return "\(line) — не записалось: \(RejectionText.shown(for: capture.rejection))"
        case .pending:
            if !configured { return "\(line) — в очереди: укажи адрес и токен в настройках Kapelka" }
            if state.tokenRefused { return "\(line) — в очереди: сервер не принял токен, проверь его в настройках Kapelka" }
            return "\(line) — нет связи, уйдёт позже"
        }
    }
}
