import Foundation

/// The server's accounts for «Карты → счета» of the settings (#415), hidden ones too. Reading them is the one moment
/// the saved cards follow the server (`CardAccountStore.reconcile`): a rename reaches the next payment, a name typed
/// in a build before #415 gets its id, a hidden account's name stops going out — at once, not at «Сохранить», which
/// «Отмена» would skip. An answer that did not come changes nothing.
struct CardAccountsSource: Sendable {
    let cards: CardAccountStore
    let accounts: @Sendable () async throws(RecordsFailure) -> [RecordAccount]

    func read() async -> Result<[RecordAccount], RecordsFailure> {
        do throws(RecordsFailure) {
            let accounts = try await accounts()
            cards.reconcile(with: accounts)
            return .success(accounts)
        } catch {
            return .failure(error)
        }
    }
}
