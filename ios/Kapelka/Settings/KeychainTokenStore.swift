import Foundation
import Security

/// The capture token as one generic password in Keychain — never in `UserDefaults`, files or logs. Readable after the
/// first unlock so the background refresh can send while the phone is locked; `ThisDeviceOnly` keeps it out of
/// backups. Keychain keeps it across reinstalls of the same bundle id.
struct KeychainTokenStore: Sendable {
    static let app = KeychainTokenStore(service: "kapelka.capture-token")

    let service: String
    let account = "SHORTCUT_CAPTURE_TOKEN"

    func read() throws(SettingsError) -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        case errSecItemNotFound:
            return nil
        default:
            throw .keychain(status)
        }
    }

    func save(_ token: String) throws(SettingsError) {
        let values: [String: Any] = [
            kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updated = SecItemUpdate(baseQuery as CFDictionary, values as CFDictionary)
        switch updated {
        case errSecSuccess:
            return
        case errSecItemNotFound:
            let added = SecItemAdd(baseQuery.merging(values) { $1 } as CFDictionary, nil)
            guard added == errSecSuccess else { throw .keychain(added) }
        default:
            throw .keychain(updated)
        }
    }

    /// The item itself, for every query. Not private: the tests clean the item up and read its attributes through it
    /// (`KapelkaTests/Support/KeychainTestItem.swift`); the app does neither.
    var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
