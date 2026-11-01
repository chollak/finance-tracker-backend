import Foundation

/// What the notifications of one pass say (FT-253, decision 2026-10-31 «отклик на каждое действие»). One pass — one
/// notification per kind: each payment its own, under its `clientId`, so a late one replaces its «уйдёт позже»; all
/// the phrases written — one; all not written — one; the token — one. «В очереди» is no news here: a payment's
/// «уйдёт позже» is posted by its command (`PaymentNotice`), a phrase was said on screen and answered there.
enum NoticeText {
    /// The token's notice: one, whatever the pass (`BackgroundNotices` keeps it from coming again).
    static let tokenId = "kapelka.token"
    /// The longest part of a phrase a notification quotes.
    static let quoteLimit = 40

    static func notices(for events: [QueueEvent]) -> [Notice] {
        var written: [Capture] = []
        var nothingFound: [Capture] = []
        var refused: [Capture] = []
        var token = false
        for event in events {
            switch event {
            case let .wrote(captures): written += captures
            case let .noOperation(captures): nothingFound += captures
            case let .rejected(captures): refused += captures
            case .tokenRefused: token = true
            case .queued: break
            }
        }
        var notices = written.filter(isPayment).map(paymentWritten)
        if let phrases = phrasesWritten(written.filter { !isPayment($0) }) {
            notices.append(phrases)
        }
        notices += refused.filter(isPayment).map(PaymentNotice.refused)
        notices += phrasesFailed(
            nothingFound: nothingFound.filter { !isPayment($0) },
            refused: refused.filter { !isPayment($0) },
            paymentsNothingFound: nothingFound.filter(isPayment)
        )
        if token {
            notices.append(Notice(id: tokenId, body: QueueStatus.tokenRefusedText, opens: .settings))
        }
        return notices
    }

    /// The payments the server answered in this pass: on screen their «уйдёт позже» is taken off.
    static func answeredPaymentIds(_ events: [QueueEvent]) -> [String] {
        events.flatMap { event -> [Capture] in
            switch event {
            case let .wrote(captures), let .noOperation(captures), let .rejected(captures): captures
            case .queued, .tokenRefused: []
            }
        }
        .filter(isPayment)
        .map(\.clientId.uuidString)
    }

    // MARK: Written

    private static func isPayment(_ capture: Capture) -> Bool {
        capture.payment != nil
    }

    /// «Записал: KORZINKA 24 · Продукты? · −25 000 сум» under the payment's `clientId`.
    private static func paymentWritten(_ capture: Capture) -> Notice {
        let records = capture.reply?.liveRecords ?? []
        let body: String
        if let record = records.first, records.count == 1 {
            body = WrittenText.wrote(record)
        } else if !records.isEmpty {
            body = "\(WrittenText.title(needsReview: records.contains(where: \.needsReview))): "
                + records.map(WrittenText.line).joined(separator: ", ")
        } else {
            let summary = capture.reply?.summary ?? ""
            body = "\(WrittenText.title(needsReview: QueueEvents.needsReview(capture))): "
                + (summary.isEmpty ? capture.payment?.line ?? "" : summary)
        }
        return Notice(id: capture.clientId.uuidString, body: body, opens: .records)
    }

    /// One for all the phrases of the pass, records counted without the ones deleted on the server.
    private static func phrasesWritten(_ captures: [Capture]) -> Notice? {
        guard let first = captures.first else { return nil }
        let replies = captures.compactMap(\.reply)
        let records = replies.flatMap(\.liveRecords)
        // A server before FT-255 answers with the ack alone: one record each
        let acks = replies.filter(\.records.isEmpty)
        let count = records.count + acks.count
        let review = records.count(where: \.needsReview) + acks.count { $0.status == "needs_review" }
        var body: String
        if count == 1, let record = records.first {
            body = WrittenText.wrote(record)
        } else if count == 1, let ack = acks.first {
            body = ack.summary.isEmpty ? "Записал" : "\(WrittenText.title(needsReview: review > 0)): \(ack.summary)"
        } else {
            body = "Записал \(WrittenText.records(count))" + (review > 0 ? " · \(review) к проверке" : "")
        }
        let withoutAmount = replies.flatMap(\.withoutAmount).map(\.description)
        if !withoutAmount.isEmpty {
            body += "\n\(withoutAmountLine(withoutAmount))"
        }
        return Notice(id: "wrote-\(first.clientId.uuidString)", body: body, opens: .records)
    }

    private static func withoutAmountLine(_ names: [String]) -> String {
        "Без суммы, не записал: \(names.joined(separator: ", "))"
    }

    // MARK: Not written

    /// One for all the phrases of the pass the server wrote nothing for: what it found, or why it refused.
    private static func phrasesFailed(
        nothingFound: [Capture],
        refused: [Capture],
        paymentsNothingFound: [Capture]
    ) -> [Notice] {
        let failed = nothingFound + refused + paymentsNothingFound
        guard let first = failed.first else { return [] }
        let body: String
        if failed.count > 1 {
            let quoted = failed.map(what).joined(separator: ", ")
            body = "Не записал \(failed.count) \(RussianPlural.form(failed.count, one: "фразу", few: "фразы", many: "фраз")): \(quoted)"
        } else if first.state == .rejected {
            body = "Не записал: \(what(first))\n\(capitalized(RejectionText.shown(for: first.rejection)))"
        } else if let names = first.reply?.withoutAmount.map(\.description), !names.isEmpty {
            body = withoutAmountLine(names)
        } else {
            body = "Не нашёл операцию: \(what(first))"
        }
        return [Notice(id: "failed-\(first.clientId.uuidString)", body: body, opens: .capture)]
    }

    /// The phrase in quotes, on one line and cut to `quoteLimit`; a payment as Wallet gave it.
    private static func what(_ capture: Capture) -> String {
        if let payment = capture.payment { return payment.line }
        let words = capture.text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard words.count > quoteLimit else { return "«\(words)»" }
        let cut = words.prefix(quoteLimit - 1).trimmingCharacters(in: .whitespaces)
        return "«\(cut)…»"
    }

    static func capitalized(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst()
    }
}
