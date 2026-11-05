import SwiftUI
import Testing
import UIKit
@testable import Kapelka

/// The token's field in the settings (#338). iOS takes a secure field for a password and, once it leaves the screen
/// with text in it — «Отмена», «Сохранить», a swipe down, «Журнал команд» — offers «Сохранить пароль?» to the iCloud
/// Keychain. The field stays hidden, but holds no text by the time it leaves the window.
@MainActor
@Suite("Поле токена")
struct TokenFieldTests {
    private let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))

    @Test("токен на экране скрыт, как пароль")
    func hidesToken() {
        #expect(TokenTextField().isSecureTextEntry)
    }

    @Test("на экране поле показывает токен — точками")
    func showsTokenOnScreen() {
        let field = TokenTextField()
        window.addSubview(field)
        field.token = TestSettings.token

        #expect(field.text == TestSettings.token)
    }

    @Test("уходя с экрана, поле пустеет, а токен остаётся")
    func emptiesBeforeLeavingWindow() {
        let field = TokenTextField()
        window.addSubview(field)
        field.token = TestSettings.token

        field.removeFromSuperview()

        #expect(field.text?.isEmpty != false)
        #expect(field.token == TestSettings.token)
    }

    @Test("вернувшись на экран, поле снова с токеном")
    func refillsOnReturn() {
        let field = TokenTextField()
        window.addSubview(field)
        field.token = TestSettings.token
        field.removeFromSuperview()

        window.addSubview(field)

        #expect(field.text == TestSettings.token)
    }

    @Test("токен, заданный вне экрана, в поле не попадает до возвращения")
    func keepsTextEmptyOffScreen() {
        let field = TokenTextField()
        field.token = TestSettings.token

        #expect(field.text?.isEmpty != false)
        window.addSubview(field)
        #expect(field.text == TestSettings.token)
    }

    @Test("ввод в поле доходит до настроек")
    func editingReachesSettings() {
        let typed = Box("")
        let coordinator = TokenField.Coordinator(
            TokenField(placeholder: "Токен", text: typed.binding, isFocused: Box(false).binding)
        )
        let field = coordinator.makeField()
        window.addSubview(field)

        type(TestSettings.token, into: field)

        #expect(typed.value == TestSettings.token)
        #expect(field.token == TestSettings.token)
    }

    @Test("уход с экрана не стирает токен в настройках: после «Журнала команд» он на месте")
    func leavingKeepsSettingsToken() {
        let typed = Box("")
        let coordinator = TokenField.Coordinator(
            TokenField(placeholder: "Токен", text: typed.binding, isFocused: Box(false).binding)
        )
        let field = coordinator.makeField()
        window.addSubview(field)
        type(TestSettings.token, into: field)

        field.removeFromSuperview()
        #expect(typed.value == TestSettings.token)

        window.addSubview(field)
        #expect(field.text == TestSettings.token)
        #expect(typed.value == TestSettings.token)
    }

    /// What the keyboard does: new text, then `.editingChanged`.
    private func type(_ text: String, into field: TokenTextField) {
        field.text = text
        field.sendActions(for: .editingChanged)
    }

    @Test("фокус поля виден настройкам: «Проверить связь» прячет клавиатуру")
    func reportsFocus() {
        let focused = Box(false)
        let coordinator = TokenField.Coordinator(
            TokenField(placeholder: "Токен", text: Box("").binding, isFocused: focused.binding)
        )
        let field = TokenTextField()

        coordinator.textFieldDidBeginEditing(field)
        #expect(focused.value)
        coordinator.textFieldDidEndEditing(field)
        #expect(focused.value == false)
    }
}

/// A value the field's bindings write to.
@MainActor
private final class Box<Value> {
    var value: Value

    init(_ value: Value) {
        self.value = value
    }

    var binding: Binding<Value> {
        Binding(get: { self.value }, set: { self.value = $0 })
    }
}
