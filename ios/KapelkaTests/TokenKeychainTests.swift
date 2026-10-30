import Foundation
import Security
import Testing
@testable import Kapelka

/// Keychain needs the app as the test host, so these run only in `xcodebuild test` on the simulator. Each suite has one
/// fixed item and runs its tests one by one; a suite is a class, so the item goes in `deinit` after every test.
@Suite("Токен в Keychain", .serialized)
final class TokenKeychainTests {
    private let tokens = KeychainTokenStore(service: "kapelka.tests.keychain")

    deinit {
        try? tokens.delete()
    }

    @Test("сохранить, прочитать, заменить, удалить")
    func roundTrip() throws {
        #expect(try tokens.read() == nil)

        try tokens.save(TestSettings.token)
        #expect(try tokens.read() == TestSettings.token)

        try tokens.save("second-token-0123456789abcdef01234567")
        #expect(try tokens.read() == "second-token-0123456789abcdef01234567")

        try tokens.delete()
        #expect(try tokens.read() == nil)
    }

    @Test("доступен после первой разблокировки и только на этом телефоне — для отправки в фоне")
    func readableInBackground() throws {
        try tokens.save(TestSettings.token)

        let attributes = try #require(try tokens.attributes())
        #expect(attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
    }
}

/// A fixed defaults suite: a new name every test would leave one more empty file in the simulator.
@Suite("Настройки", .serialized)
final class SettingsStoreTests {
    private let suite = "kapelka.tests.settings"
    private let tokens = KeychainTokenStore(service: "kapelka.tests.settings")

    deinit {
        try? tokens.delete()
        UserDefaults.standard.removePersistentDomain(forName: suite)
    }

    private func makeStore() throws -> SettingsStore {
        SettingsStore(defaults: try #require(UserDefaults(suiteName: suite)), tokens: tokens)
    }

    @Test("адрес — в настройках приложения, токен — только в Keychain")
    func tokenOnlyInKeychain() throws {
        let store = try makeStore()
        try store.save(address: "kapelka-pc.example-tailnet.ts.net", token: TestSettings.token)

        #expect(store.configuration() == ServerConfiguration(baseURL: TestSettings.address, token: TestSettings.token))
        #expect(try tokens.read() == TestSettings.token)
        let defaults = try #require(UserDefaults(suiteName: suite)).dictionaryRepresentation()
        #expect(!defaults.values.contains { "\($0)".contains(TestSettings.token) })
        #expect(!UserDefaults.standard.dictionaryRepresentation().values.contains { "\($0)".contains(TestSettings.token) })
    }

    @Test("пустое поле токена оставляет сохранённый")
    func emptyTokenKeepsSaved() throws {
        let store = try makeStore()
        try store.save(address: "kapelka-pc.example-tailnet.ts.net", token: TestSettings.token)
        try store.save(address: "http://localhost:3177", token: "  ")

        #expect(store.configuration()?.token == TestSettings.token)
        #expect(store.configuration()?.baseURL.absoluteString == "http://localhost:3177")
    }

    @Test("без адреса или без токена отправлять некуда")
    func incompleteSettings() throws {
        let store = try makeStore()
        #expect(store.configuration() == nil)

        #expect(throws: SettingsError.noToken) {
            try store.save(address: "kapelka-pc.example-tailnet.ts.net", token: "")
        }
        #expect(store.configuration() == nil)
        #expect(throws: SettingsError.badAddress) { try store.save(address: "два слова", token: TestSettings.token) }
        #expect(try tokens.read() == nil)
    }

    @Test("настройки переживают новый экземпляр — как после переустановки поверх")
    func survivesNewInstance() throws {
        try makeStore().save(address: "kapelka-pc.example-tailnet.ts.net", token: TestSettings.token)

        #expect(try makeStore().configuration() == ServerConfiguration(baseURL: TestSettings.address, token: TestSettings.token))
        #expect(try makeStore().hasToken)
    }
}
