import SwiftUI

extension Haptic {
    /// The system's haptic for each row of FT-251.
    var sensoryFeedback: SensoryFeedback {
        switch self {
        case .listening: .impact(weight: .medium)
        case .success: .success
        case .warning: .warning
        case .queued: .impact(weight: .light)
        case .error: .error
        }
    }
}

extension View {
    /// Plays what the entry chose. Once, on the root of the app: one event is one haptic, whichever tab or sheet is
    /// open.
    func playsHaptics(of entry: FeedbackEntry) -> some View {
        sensoryFeedback(trigger: entry.pulse) { _, pulse in pulse?.haptic.sensoryFeedback }
    }
}
