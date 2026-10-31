import Foundation
import Testing
@testable import Kapelka

/// The server with one script per route: the list asks for the page and the accounts at once, so one shared script
/// would answer them in whatever order the requests happen to go out.
struct RoutedTransport: HTTPTransport {
    static let page = "/api/transactions"
    static let accounts = "/api/accounts"

    let routes: [String: FakeTransport]

    init(page: [FakeTransport.Reply] = [], accounts: [FakeTransport.Reply] = []) {
        routes = [Self.page: FakeTransport(page), Self.accounts: FakeTransport(accounts)]
    }

    var pages: FakeTransport { routes[Self.page]! }
    var accountLists: FakeTransport { routes[Self.accounts]! }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let path = try #require(request.url).path()
        let route = try #require(routes[path], "no script for \(path)")
        return try await route.data(for: request)
    }
}

