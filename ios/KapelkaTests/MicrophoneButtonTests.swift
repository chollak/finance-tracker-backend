import Testing
@testable import Kapelka

/// #285: the microphone button says what a press does in each phase (`VoiceCapture.toggle`) — VoiceOver used to hear
/// «Закончить фразу» while the press cancelled the start or did nothing.
@Suite("Записать: кнопка микрофона для VoiceOver")
struct MicrophoneButtonTests {
    @Test(
        "название по фазе: сказать трату, отменить включение, закончить фразу; пока фраза пишется — «Записываю…» и неактивна",
        arguments: [
            (VoiceCapture.Phase.idle, "Сказать трату", true),
            (.starting, "Отменить", true),
            (.listening, "Закончить фразу", true),
            (.finishing, "Записываю…", false),
            (.saving, "Записываю…", false),
        ]
    )
    func byPhase(phase: VoiceCapture.Phase, label: String, enabled: Bool) {
        #expect(MicrophoneButtonState.label(phase) == label)
        #expect(MicrophoneButtonState.isEnabled(phase) == enabled)
    }
}
