import Foundation

/// What VoiceOver says of the card «Последняя фраза» (#285, decision 2026-10-31 «ни одного „а что происходит?“»): the
/// outcome answered with a haptic only, and VoiceOver read it once the user got to the card. Each line of the outcome
/// is said once, word for word as the card shows it; several at once — joined as the bar joins its parts. No news:
/// - «Отправляю…»;
/// - «Удалено…» — the bar «Удалено · Вернуть» says the delete (`RootView`), and «Вернуть» brings back a line said before;
/// - the card the screen opens with — it was there before;
/// - the same reason after another attempt — as with the haptic, an attempt that fails again is no news (`QueueEvents`).
///
/// While the microphone is on nothing is said — VoiceOver's voice would go into the phrase; what came meanwhile is said
/// once it is off.
struct LastPhraseSpeech {
    /// The card's phrase and the lines it has shown; `nil` before the first card.
    private var seen: Seen?
    /// News that came while the microphone was on.
    private var held: [String] = []

    private struct Seen {
        let phrase: UUID?
        let lines: Set<String>
    }

    /// The words for `AccessibilityNotification.Announcement` as the card and the microphone are now; `nil` — nothing
    /// new to say.
    mutating func news(_ card: LastPhrase?, voice phase: VoiceCapture.Phase) -> String? {
        if let card {
            held += newLines(of: card)
        }
        guard !Self.microphoneIsOn(phase), !held.isEmpty else { return nil }
        defer { held = [] }
        return held.joined(separator: ". ")
    }

    private mutating func newLines(of card: LastPhrase) -> [String] {
        let keys = card.lines.map(Self.key)
        guard let seen else {
            self.seen = Seen(phrase: card.id, lines: Set(keys))
            return []
        }
        let known = seen.phrase == card.id ? seen.lines : []
        self.seen = Seen(phrase: card.id, lines: known.union(keys))
        return card.lines.filter { Self.isOutcome($0.kind) && !known.contains(Self.key($0)) }.map(\.text)
    }

    /// A line is the same news while its kind is: the account's name coming after a repeat, or a new time of the
    /// 429 pause, is not said again.
    private static func key(_ line: LastPhrase.Line) -> String {
        "\(line.id) \(line.kind)"
    }

    private static func isOutcome(_ kind: LastPhrase.Line.Kind) -> Bool {
        switch kind {
        case .sending, .deleted:
            false
        case .offline, .noAnswer, .later, .busy, .notConfigured, .tokenRefused, .written, .review, .withoutAmount,
             .notFound, .refused:
            true
        }
    }

    /// Starting, listening or ending the phrase: what VoiceOver says would be heard.
    private static func microphoneIsOn(_ phase: VoiceCapture.Phase) -> Bool {
        switch phase {
        case .starting, .listening, .finishing: true
        case .idle, .saving: false
        }
    }
}
