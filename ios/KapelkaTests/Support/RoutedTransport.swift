import Foundation
import Testing
@testable import Kapelka

/// The server with one script per route: the list asks for the page and the accounts at once, so one shared script
/// would answer them in whatever order the requests happen to go out.
struct RoutedTransport: HTTPTransport {
    static let page = "/api/transactions"
    static let accounts = "/api/accounts"
    static let categories = "/api/categories"
    /// `DELETE` and `PUT /api/transactions/:id`, `POST /api/transactions/:id/restore` — one script in the order sent.
    static let edits = "/api/transactions/"

    let routes: [String: FakeTransport]

    init(
        page: [FakeTransport.Reply] = [],
        accounts: [FakeTransport.Reply] = [],
        categories: [FakeTransport.Reply] = [],
        edits: [FakeTransport.Reply] = []
    ) {
        routes = [
            Self.page: FakeTransport(page),
            Self.accounts: FakeTransport(accounts),
            Self.categories: FakeTransport(categories),
            Self.edits: FakeTransport(edits),
        ]
    }

    var pages: FakeTransport { routes[Self.page]! }
    var accountLists: FakeTransport { routes[Self.accounts]! }
    var categoryLists: FakeTransport { routes[Self.categories]! }
    var recordEdits: FakeTransport { routes[Self.edits]! }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let path = try #require(request.url).path()
        let key = path.hasPrefix(Self.edits) ? Self.edits : path
        let route = try #require(routes[key], "no script for \(path)")
        return try await route.data(for: request)
    }
}
