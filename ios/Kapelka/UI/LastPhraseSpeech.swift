import Foundation

/// What VoiceOver says of the card «Последняя фраза» (#285, decision 2026-10-31 «ни одного „а что происходит?“»): the
/// outcome answered with a haptic only, and VoiceOver read it once the user got to the card. Each line of the outcome
/// is said once, word for word as the card shows it; so is the note under the phrase — «Уже отправляется…», «Не
/// удалилось: …» (#346). Several at once — joined as the bar joins its parts. No news:
/// - «Отправляю…»;
/// - «Удалено: …» of a record on the server — the bar «Удалено · Вернуть» says that delete (`RootView`), and «Вернуть»
///   brings back a line said before. «Удалено с телефона» has no bar: the card says it (#346);
/// - the card the screen opens with — it was there before;
/// - the same reason after another attempt — as with the haptic, an attempt that fails again is no news (`QueueEvents`).
///
/// While the microphone is on nothing is said — VoiceOver's voice would go into the phrase; what came meanwhile is said
/// once it is off, unless the app left the screen first.
struct LastPhraseSpeech {
    /// The card's phrase and the lines it has shown; `nil` before the first card.
    private var seen: Seen?
    /// News that came while the microphone was on.
    private var held: [String] = []

    private struct Seen {
        let phrase: UUID?
        let lines: Set<String>
        /// The note shown now: one that goes and comes back is news again.
        let note: String?
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

    /// The app went off screen — the phone locked mid-phrase (#346, review of PR #345): what waited for the microphone
    /// is not said on the return. By then the card shows the next phrase, and a line held may be untrue: the queue sends
    /// in the background (`AppModel.appMovedToBackground`), «Нет связи» may be «Записал». What VoiceOver missed is on the
    /// screen — in «Записи» or in «Требует внимания».
    mutating func appLeftScreen() {
        held = []
    }

    private mutating func newLines(of card: LastPhrase) -> [String] {
        // «Отправляю…» while the microphone writes the phrase to the phone: no id and no outcome yet. Not remembered —
        // a phrase not saved there (`.notSaved`) brings the older card back, and its outcome would sound again
        guard card.id != nil else { return [] }
        let keys = card.lines.map(Self.key)
        guard let seen else {
            self.seen = Seen(phrase: card.id, lines: Set(keys), note: card.note)
            return []
        }
        let same = seen.phrase == card.id
        let known = same ? seen.lines : []
        self.seen = Seen(phrase: card.id, lines: known.union(keys), note: card.note)
        let lines = card.lines.filter { Self.isNews($0) && !known.contains(Self.key($0)) }.map(\.text)
        guard let note = card.note, !same || note != seen.note else { return lines }
        return lines + [note]
    }

    /// A line is the same news while its kind is: the account's name coming after a repeat, or a new time of the
    /// 429 pause, is not said again.
    private static func key(_ line: LastPhrase.Line) -> String {
        "\(line.id) \(line.kind)"
    }

    private static func isNews(_ line: LastPhrase.Line) -> Bool {
        switch line.kind {
        case .sending:
            false
        case .deleted:
            line.id == LastPhrase.removedLineId
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
