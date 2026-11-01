import Foundation

/// «Записать оплату» without App Intents around it (FT-179): the payment on disk first, so no network is needed; its
/// card noticed for the settings; then one try to send within the time iOS gives a command, and one notification on
/// what became of it. The server's answer is the pass's notification (FT-253, `NoticeText`): this posts only what no
/// pass tells — «уйдёт позже» and a refusal on the phone (`PaymentNotice`).
struct PaymentRecorder: Sendable {
    let queue: CaptureQueue
    let cards: CardAccountStore
    /// Sends the queue within the command's time: `BackgroundSend.run()`.
    let send: @Sendable () async -> Void
    let isConfigured: @Sendable () -> Bool
    /// Posts the notification, under the payment's `clientId`: `SystemNoticeCenter.add`.
    let notify: @Sendable (Notice) async -> Void

    /// An amount that names no currency takes the card's from the settings, then the automation's «Валюта». Throws
    /// when the payment could not be written to the phone — the automation must fail loudly then.
    func record(_ input: PaymentInput) async throws {
        cards.noticed(input.card)
        var payment = input
        payment.currency = input.card.flatMap(cards.currency(for:)) ?? input.currency
        let capture = try await queue.addPayment(payment)
        if capture.state == .pending {
            await send()
        }
        let state = await queue.state()
        let now = state.captures.first { $0.clientId == capture.clientId } ?? capture
        guard let notice = PaymentNotice.notice(for: now, state, configured: isConfigured()) else { return }
        await notify(notice)
    }
}
