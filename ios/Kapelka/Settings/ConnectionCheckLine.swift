import Foundation

/// The line under «Проверить связь» (#283). It belongs to the fields it was checked with: an edit of the address or the
/// token clears it, and the answer of a check started before the edit is not shown — «токен принят» never stays under
/// another token.
struct ConnectionCheckLine: Equatable {
    private(set) var text: String?
    private(set) var isChecking = false
    /// Which check may still show its answer: each start and each edit moves it on.
    private var current = 0

    /// Pass the result to `finish`.
    mutating func start() -> Int {
        current += 1
        isChecking = true
        text = nil
        return current
    }

    mutating func finish(_ check: Int, with answer: String) {
        guard check == current else { return }
        isChecking = false
        text = answer
    }

    /// The button is free again: the check still running answers for fields that are gone.
    mutating func fieldsChanged() {
        current += 1
        isChecking = false
        text = nil
    }
}
