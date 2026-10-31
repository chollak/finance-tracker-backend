import AVFAudio
import Foundation
import Testing
@testable import Kapelka

/// `AVAudioSession` as the microphone sets it up, call by call.
final class RecordedSession: RecordingSession {
    private(set) var calls: [String] = []
    var failsCategory = false

    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws {
        if failsCategory { throw URLError(.unknown) }
        calls.append("category \(category.rawValue) \(mode.rawValue) duckOthers=\(options.contains(.duckOthers))")
    }

    func setAllowHapticsAndSystemSoundsDuringRecording(_ inValue: Bool) throws {
        calls.append("haptics \(inValue)")
    }

    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws {
        calls.append("active \(active) notifyOthers=\(options.contains(.notifyOthersOnDeactivation))")
    }
}

/// While the microphone records, iOS mutes haptics unless the session allows them (FT-251): the start of listening
/// would not be felt.
@Suite("Голос: сессия звука")
struct ListeningSessionTests {
    @Test("вибрация разрешена во время записи, и до setActive")
    func hapticsAllowedBeforeActivation() throws {
        let session = RecordedSession()

        try ListeningSession.activate(session)

        #expect(session.calls == [
            "category \(AVAudioSession.Category.record.rawValue) \(AVAudioSession.Mode.measurement.rawValue) duckOthers=true",
            "haptics true",
            "active true notifyOthers=true",
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
