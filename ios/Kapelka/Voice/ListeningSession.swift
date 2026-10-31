import AVFAudio

/// What the microphone sets on `AVAudioSession`; tests check it call by call.
protocol RecordingSession: AnyObject {
    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws
    func setAllowHapticsAndSystemSoundsDuringRecording(_ inValue: Bool) throws
    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws
}

extension AVAudioSession: RecordingSession {}

enum ListeningSession {
    /// Recording that lets haptics through. While the microphone is on, iOS mutes them unless the session allows
    /// them, and the start of listening — felt, not seen, with the Action Button — would stay silent (FT-251). Allowed
    /// before `setActive`, as the session takes it.
    static func activate(_ session: some RecordingSession) throws {
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setAllowHapticsAndSystemSoundsDuringRecording(true)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }
}
