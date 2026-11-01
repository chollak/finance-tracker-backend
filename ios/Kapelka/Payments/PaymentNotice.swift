import Foundation

/// The notification «Записать оплату» posts once it has tried to send its payment (FT-179). Shukur's decision of
/// 2026-10-30: no dialog with «Готово» after each payment — a notification goes away by itself, and the result stays
/// in the Kapelka list and in the Mini App. What the server answered is the pass's news since FT-253 (`NoticeText`):
/// off screen «Записал: …» or «Не записал: …» under the same `clientId`, on screen a haptic. The command itself tells
/// what no pass reports: «уйдёт позже», which a later «Записал: …» replaces, and a refusal on the phone.
enum PaymentNotice {
    /// `nil` when the server answered: the pass has said it already.
    static func notice(for capture: Capture, _ state: QueueState, configured: Bool) -> Notice? {
        let id = capture.clientId.uuidString
        switch capture.state {
        case .sent:
            return nil
        case .rejected:
            // Refused by the server: its answer, a notice of the pass
            return capture.attempts == 0 ? refused(capture) : nil
        case .pending:
            let line = waiting(capture)
            if !configured {
                return Notice(id: id, body: "\(line) — в очереди: укажи адрес и токен в настройках Kapelka", opens: .settings)
            }
            // Why the token: the token's own notice says it, once (FT-253)
            if state.tokenRefused {
                return Notice(id: id, body: "\(line) — в очереди до нового токена", opens: .settings)
            }
            // Only a 429 leaves `notBefore`; no network and a sleeping PC look alike from here, so no reason for them
            let reason = state.notBefore == nil ? "уйдёт позже" : "сервер просит подождать, уйдёт позже"
            return Notice(id: id, body: "\(line) — \(reason)", opens: .capture)
        }
    }

    /// «Не записал: KORZINKA 24 · 25 000,00 UZS» and why, on the phone or by the server — «Записать» shows it. The
    /// amount as Wallet gave it: it may be what was not understood.
    static func refused(_ capture: Capture) -> Notice {
        let line = capture.payment?.line ?? "Оплата Apple Pay"
        let reason = NoticeText.capitalized(RejectionText.shown(for: capture.rejection))
        return Notice(id: capture.clientId.uuidString, body: "Не записал: \(line)\n\(reason)", opens: .capture)
    }

    /// «KORZINKA 24 · −25 000 сум»: the amount as the «Записал: …» that replaces it will show it (`MoneyText`).
    private static func waiting(_ capture: Capture) -> String {
        guard let payment = capture.payment else { return "Оплата Apple Pay" }
        guard let minor = payment.amountMinor, let currency = payment.currency else { return payment.line }
        let amount = MoneyText.format(minor: -minor, currency: currency, sign: .always)
        return "\(payment.merchant ?? "Оплата Apple Pay") · \(amount)"
    }
}
