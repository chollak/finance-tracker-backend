import Foundation

/// What the card «Последняя фраза» (FT-252) knows beyond the queue: the queue keeps the server's answer as it was when
/// the phrase was written, and forgets a phrase taken off the phone. Kept between launches, so the card says the same
/// after a restart.
struct LastPhraseMarks: Codable, Equatable, Sendable {
    /// A phrase «Удалить» took off the phone while it waited: the queue has it no more.
    struct Removed: Codable, Equatable, Sendable {
        let text: String
        let capturedAt: Date
        /// It had gone to the server before: a timeout does not say whether the server wrote it.
        let triedBefore: Bool
    }

    /// The phrase the marks are about; marks of an older phrase mean nothing for a newer one.
    let clientId: UUID
    var removed: Removed?
    /// The phrase's records the server deleted — through the card or a swipe in «Записи» (FT-221), or found deleted
    /// elsewhere (404). «Вернуть» takes them off.
    var deleted: Set<String> = []
}

/// The marks in the app's `UserDefaults`, one phrase at a time. Used on the main actor only.
final class LastPhraseMemory {
    private static let key = "lastPhrase.marks"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// A value this build cannot read is no marks: the card shows the queue as it is.
    var marks: LastPhraseMarks? {
        get {
            defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(LastPhraseMarks.self, from: $0) }
        }
        set {
            guard let newValue, let data = try? JSONEncoder().encode(newValue) else {
                defaults.removeObject(forKey: Self.key)
                return
            }
            defaults.set(data, forKey: Self.key)
        }
    }
}
