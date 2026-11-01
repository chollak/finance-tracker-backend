import AVFAudio
import Foundation
import Testing
@testable import Kapelka

/// `AVAudioSession` as the microphone sets it up, call by call.
final class RecordedSession: RecordingSession {
    enum Call: Equatable {
        case category(AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)
        case haptics(Bool)
        case active(Bool, AVAudioSession.SetActiveOptions)
    }

    private(set) var calls: [Call] = []
    var failsCategory = false
    var failsHaptics = false

    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws {
        if failsCategory { throw URLError(.unknown) }
        calls.append(.category(category, mode, options))
    }

    func setAllowHapticsAndSystemSoundsDuringRecording(_ inValue: Bool) throws {
        if failsHaptics { throw URLError(.unknown) }
        calls.append(.haptics(inValue))
    }

    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws {
        calls.append(.active(active, options))
    }
}

/// While the microphone records, iOS mutes haptics unless the session allows them (FT-251): the start of listening
/// would not be felt.
@Suite("Голос: сессия звука")
struct ListeningSessionTests {
    @Test("вибрация разрешена во время записи, и до setActive; опции — ровно эти")
    func hapticsAllowedBeforeActivation() throws {
        let session = RecordedSession()

        try ListeningSession.activate(session)

        #expect(session.calls == [
            .category(.record, .measurement, .duckOthers),
            .haptics(true),
            .active(true, .notifyOthersOnDeactivation),
        ])
    }

    @Test("вибрацию не разрешили — голос всё равно слушает, только без вибрации")
    func hapticsRefusedStillListens() throws {
        let session = RecordedSession()
        session.failsHaptics = true

        try ListeningSession.activate(session)

        #expect(session.calls == [
            .category(.record, .measurement, .duckOthers),
            .active(true, .notifyOthersOnDeactivation),
        ])
    }

    @Test("категория не встала — сессия не включается")
    func failedCategoryStops() {
        let session = RecordedSession()
        session.failsCategory = true

        #expect(throws: URLError.self) { try ListeningSession.activate(session) }
        #expect(session.calls.isEmpty)
    }
}
