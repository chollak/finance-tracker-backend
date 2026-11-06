import Foundation
import Security
@testable import Kapelka

/// What only the tests do with the token's item (#284): the app never deletes it — a new token replaces the old one —
/// and never reads its attributes.
extension KeychainTokenStore {
    /// Before and after each test: a run that stopped halfway may have left the item behind.
    func delete() throws(SettingsError) {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw .keychain(status) }
    }

    /// The item's attributes without the token itself; for the test of its accessibility.
    func attributes() throws(SettingsError) -> [String: Any]? {
        var query = baseQuery
        query[kSecReturnAttributes as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess: return result as? [String: Any]
        case errSecItemNotFound: return nil
        default: throw .keychain(status)
        }
    }
}
