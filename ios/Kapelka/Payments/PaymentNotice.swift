import Foundation

/// The notification «Записать оплату» posts once it has tried to send its payment (FT-179). Shukur's decision of
/// 2026-10-30: no dialog with «Готово» after each payment — a notification goes away by itself, and the result stays
/// in the Kapelka list and in the Mini App. What the server answered is the pass's news since FT-253 (`NoticeText`):
/// off screen «Записал: …» or «Не записал: …» under the same `clientId`, on screen a haptic. The command itself tells
/// what no pass reports: «уйдёт позже», which a later «Записал: …» replaces, and a refusal on the phone.
enum PaymentNotice {
    /// `nil` when the server answered: the pass has said it already.
    static func notice(for capture: Capture, _ state: QueueState, configured: Bool) -> Notice? {
        let line = capture.payment?.line ?? "Оплата Apple Pay"
        let id = capture.clientId.uuidString
        switch capture.state {
        case .sent:
            return nil
        case .rejected:
            // Refused by the server: its answer, a notice of the pass
            return capture.attempts == 0 ? refused(capture) : nil
        case .pending:
            if !configured {
                return Notice(id: id, body: "\(line) — в очереди: укажи адрес и токен в настройках Kapelka", opens: .settings)
            }
            if state.tokenRefused {
                return Notice(
                    id: id,
                    body: "\(line) — в очереди: сервер не принял токен, проверь его в настройках Kapelka",
                    opens: .settings
                )
            }
            return Notice(id: id, body: "\(line) — нет связи, уйдёт позже", opens: .capture)
        }
    }

    /// «Не записал: KORZINKA 24 · 25 000,00 UZS» and why, on the phone or by the server — «Записать» shows it.
    static func refused(_ capture: Capture) -> Notice {
        let line = capture.payment?.line ?? "Оплата Apple Pay"
        let reason = NoticeText.capitalized(RejectionText.shown(for: capture.rejection))
        return Notice(id: capture.clientId.uuidString, body: "Не записал: \(line)\n\(reason)", opens: .capture)
    }
}
