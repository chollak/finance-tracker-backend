import Foundation

/// Where the queue sends: the address in the app's `UserDefaults` (not a secret), the token only in Keychain.
/// Both live in the app's container and Keychain, so a reinstall over the old build keeps them.
final class SettingsStore: @unchecked Sendable {
    // UserDefaults and Keychain are thread-safe; the class keeps no state of its own
    private static let addressKey = "serverAddress"

    private let defaults: UserDefaults
    private let tokens: KeychainTokenStore

    init(defaults: UserDefaults = .standard, tokens: KeychainTokenStore = .app) {
        self.defaults = defaults
        self.tokens = tokens
    }

    var address: URL? {
        defaults.string(forKey: Self.addressKey).flatMap(URL.init(string:))
    }

    var hasToken: Bool {
        (try? tokens.read()) != nil
    }

    func configuration() -> ServerConfiguration? {
        guard let address, let token = try? tokens.read() else { return nil }
        return ServerConfiguration(baseURL: address, token: token)
    }

    /// Checks both fields before writing either. An empty token field keeps the saved token.
    func save(address rawAddress: String, token rawToken: String) throws(SettingsError) {
        guard let address = ServerAddress.normalized(rawAddress) else { throw .badAddress }
        let token: String?
        if rawToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            guard hasToken else { throw .noToken }
            token = nil
        } else {
            token = try CaptureToken.validated(rawToken)
        }

        if let token {
            try tokens.save(token)
        }
        defaults.set(address.absoluteString, forKey: Self.addressKey)
    }
}
