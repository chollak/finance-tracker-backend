import Foundation

/// The error in a Kapelka answer, for the queue and the records client. It comes nested from a handler
/// (`handleControllerError`: `{ success: false, error: { code, message } }`) and flat from middleware
/// (`{ success: false, error, code }`) — `docs/QUICK_CAPTURE_API.md`, «Errors».
struct ServerError: Equatable, Sendable {
    let code: String?
    let message: String
}

extension ServerError {
    /// `nil` when the body is not one of the two shapes: a proxy's page, an empty body.
    init?(body: Data) {
        let decoder = JSONDecoder()
        if let nested = try? decoder.decode(Nested.self, from: body) {
            code = nested.error.code
            message = nested.error.message
        } else if let flat = try? decoder.decode(Flat.self, from: body) {
            code = flat.code
            message = flat.error
        } else {
            return nil
        }
    }
}

private struct Nested: Decodable {
    struct Detail: Decodable {
        let code: String?
        let message: String

        private enum CodingKeys: String, CodingKey {
            case code
            case message
        }

        // Only the message decides that this is the handler's error; a code of another kind is just not read
        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            message = try container.decode(String.self, forKey: .message)
            code = try? container.decodeIfPresent(String.self, forKey: .code)
        }
    }

    let error: Detail
}

private struct Flat: Decodable {
    let error: String
    let code: String?

    private enum CodingKeys: String, CodingKey {
        case error
        case code
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        error = try container.decode(String.self, forKey: .error)
        code = try? container.decodeIfPresent(String.self, forKey: .code)
    }
}
