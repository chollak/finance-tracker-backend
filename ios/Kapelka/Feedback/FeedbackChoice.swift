import Foundation

/// Something the phone answers (FT-251, decision 2026-10-31 «отклик на каждое действие»).
enum FeedbackEvent: Equatable, Sendable {
    /// One pass of the queue: what it did (`QueueEvents.between`).
    case queue([QueueEvent])
    /// The microphone listens — the button, the Action Button, «Записать трату» (`VoiceCapture` → `.listening`).
    case listening
    /// Voice ended with a `VoiceProblem`: not heard, no access, not saved on the phone.
    case voiceFailed
    /// «Записи»: the category saved, «Вернуть» brought the record back (FT-221).
    case editSaved
    /// «Записи»: a delete, «Вернуть» or a category the server did not take — no network, the record or the category
    /// gone (FT-221).
    case editFailed
}

/// The haptics of the task's table; `UI/Haptics.swift` plays them through `sensoryFeedback`. No sounds, and no
/// switch of its own: the system's «Системные тактильные сигналы» turns them off.
enum Haptic: Equatable, Sendable {
    /// `.impact(weight: .medium)`: `.start` vibrates on Apple Watch only.
    case listening
    case success
    /// «Записал, проверь».
    case warning
    /// `.impact(weight: .light)`: the record waits in the queue.
    case queued
    case error
}

enum FeedbackResponse: Equatable, Sendable {
    case haptic(Haptic)
    /// The app is not on screen: what the pass did goes to the notifications (FT-253).
    case notices([QueueEvent])
    case nothing
}

/// «Вибрация, уведомление или ничего» for one event. On screen (`scenePhase == .active`) — a haptic. Off screen a
/// pass of the queue goes to the notifications; the microphone and the edits of «Записи» are no news there.
enum FeedbackChoice {
    static func response(to event: FeedbackEvent, onScreen: Bool) -> FeedbackResponse {
        switch event {
        case let .queue(events):
            guard !events.isEmpty else { return .nothing }
            guard onScreen else { return .notices(events) }
            return haptic(for: events).map(FeedbackResponse.haptic) ?? .nothing
        case .listening:
            return onScreen ? .haptic(.listening) : .nothing
        case .voiceFailed, .editFailed:
            return onScreen ? .haptic(.error) : .nothing
        case .editSaved:
            return onScreen ? .haptic(.success) : .nothing
        }
    }

    /// One haptic for the whole pass, the most important news: an error, then «проверь», «записал», «в очереди».
    static func haptic(for events: [QueueEvent]) -> Haptic? {
        var written: [Capture] = []
        var queued = false
        for event in events {
            switch event {
            case .noOperation, .rejected, .tokenRefused: return .error
            case let .wrote(captures): written += captures
            case .queued: queued = true
            }
        }
        if written.contains(where: QueueEvents.needsReview) { return .warning }
        if !written.isEmpty { return .success }
        return queued ? .queued : nil
    }
}
