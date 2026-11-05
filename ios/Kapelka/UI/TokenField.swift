import SwiftUI
import UIKit

/// The token's field in the settings (#338). It is hidden like a password, so iOS takes it for one: once a secure
/// field leaves the screen with text in it — «Отмена», «Сохранить», a swipe down, «Журнал команд» — iOS offers
/// «Сохранить пароль?» to the iCloud Keychain. No content type turns that off (`.oneTimeCode` still asks on iOS 27),
/// so the field holds no text by the time it leaves the window; the token stays in `text`.
struct TokenField: UIViewRepresentable {
    let placeholder: String
    @Binding var text: String
    @Binding var isFocused: Bool

    func makeUIView(context: Context) -> TokenTextField {
        context.coordinator.makeField()
    }

    func updateUIView(_ field: TokenTextField, context: Context) {
        context.coordinator.parent = self
        field.placeholder = placeholder
        field.accessibilityLabel = placeholder
        field.token = text
        if isFocused, !field.isFirstResponder, field.window != nil {
            field.becomeFirstResponder()
        } else if !isFocused, field.isFirstResponder {
            field.resignFirstResponder()
        }
    }

    /// As wide as the row whatever the token's length, as tall as one line of text.
    func sizeThatFits(_ proposal: ProposedViewSize, uiView field: TokenTextField, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? field.intrinsicContentSize.width, height: field.intrinsicContentSize.height)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    @MainActor
    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: TokenField

        init(_ parent: TokenField) {
            self.parent = parent
        }

        /// The field with its edits and focus sent here.
        func makeField() -> TokenTextField {
            let field = TokenTextField()
            field.delegate = self
            field.addTarget(self, action: #selector(edited(_:)), for: .editingChanged)
            return field
        }

        @objc func edited(_ field: TokenTextField) {
            field.token = field.text ?? ""
            parent.text = field.token
        }

        func textFieldDidBeginEditing(_ textField: UITextField) {
            if !parent.isFocused { parent.isFocused = true }
        }

        func textFieldDidEndEditing(_ textField: UITextField) {
            if parent.isFocused { parent.isFocused = false }
        }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            textField.resignFirstResponder()
            return false
        }
    }
}

/// A secure text field that shows `token` only while it is in a window: right before it leaves one it empties
/// itself, so iOS finds nothing to offer to save as a password (#338).
final class TokenTextField: UITextField {
    /// What the field holds; the screen gets it while the field is in a window.
    var token = "" {
        didSet { showToken() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isSecureTextEntry = true
        autocapitalizationType = .none
        autocorrectionType = .no
        spellCheckingType = .no
        font = .preferredFont(forTextStyle: .body)
        adjustsFontForContentSizeCategory = true
        // The settings tint their controls `.primary`
        tintColor = .label
        setContentHuggingPriority(.defaultLow, for: .horizontal)
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        // Before UIKit sees the field go: a secure field with text is what iOS offers to save
        if newWindow == nil {
            text = ""
        }
        super.willMove(toWindow: newWindow)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        showToken()
    }

    private func showToken() {
        guard window != nil, text != token else { return }
        text = token
    }
}
