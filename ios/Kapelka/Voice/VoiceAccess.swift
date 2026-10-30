import Foundation

/// A permission as iOS reports it. iOS shows its dialog only while it is `notAsked`; after that only Settings change it.
enum Permission: Sendable, Equatable {
    case notAsked
    case granted
    case denied
}

/// Russian recognition on this phone.
enum RussianRecognition: Sendable, Equatable {
    /// No Russian recognizer at all.
    case missing
    /// Only through Apple's servers: the Russian dictation is not downloaded to the phone.
    case networkOnly
    /// On the phone, but not now (dictation or Siri turned off).
    case unavailable
    case ready
}

/// The microphone, recognition permissions and the recognizer; tests replace it.
@MainActor
protocol VoiceSystem: AnyObject {
    func microphone() -> Permission
    func requestMicrophone() async -> Permission
    func recognition() -> Permission
    func requestRecognition() async -> Permission
    func russian() -> RussianRecognition
}

/// Why voice input did not start or ended without a record; the screen says it, and mostly offers the keyboard.
enum VoiceProblem: Sendable, Equatable {
    case microphoneDenied
    case recognitionDenied
    case noRussianDictation
    case unavailable
    case nothingHeard
    case failed
    /// The phrase was heard but not written to the phone.
    case notSaved

    var message: String {
        switch self {
        case .microphoneDenied:
            "Микрофон выключен для Kapelka: Настройки → Kapelka → Микрофон. Пока — текстом"
        case .recognitionDenied:
            "Распознавание речи выключено для Kapelka: Настройки → Kapelka → Распознавание речи. Пока — текстом"
        case .noRussianDictation:
            "Скачай русскую диктовку: Настройки → Основные → Клавиатура — включи «Диктовку» и добавь клавиатуру "
                + "«Русская». Пока — текстом"
        case .unavailable:
            "Распознавание речи сейчас недоступно — напиши текстом"
        case .nothingHeard:
            "Не расслышал — скажи ещё раз или напиши"
        case .failed:
            "Распознавание прервалось — напиши текстом"
        case .notSaved:
            "Не сохранилось на телефоне — запиши текстом ещё раз"
        }
    }

    /// The keyboard opens with the message: voice will not work now. «Не расслышал» is worth one more try.
    var needsKeyboard: Bool {
        self != .nothingHeard
    }

    /// A refusal is changed only in the app's Settings, so the screen offers a button there.
    var opensSettings: Bool {
        self == .microphoneDenied || self == .recognitionDenied
    }
}

enum VoiceAccess {
    /// Asks only what iOS never asked — so each dialog appears once — then checks Russian on the phone. `nil` when
    /// listening may start.
    @MainActor
    static func check(_ system: any VoiceSystem) async -> VoiceProblem? {
        var microphone = system.microphone()
        if microphone == .notAsked {
            microphone = await system.requestMicrophone()
        }
        guard microphone == .granted else { return .microphoneDenied }

        var recognition = system.recognition()
        if recognition == .notAsked {
            recognition = await system.requestRecognition()
        }
        guard recognition == .granted else { return .recognitionDenied }

        switch system.russian() {
        case .ready: return nil
        case .networkOnly: return .noRussianDictation
        case .missing, .unavailable: return .unavailable
        }
    }
}
