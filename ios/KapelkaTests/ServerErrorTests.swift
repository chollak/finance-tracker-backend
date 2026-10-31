import Foundation
import Testing
@testable import Kapelka

/// The error body the queue and the records client both read (`docs/QUICK_CAPTURE_API.md`, «Errors»).
@Suite("Ошибка в ответе сервера")
struct ServerErrorTests {
    @Test("вложенная от обработчика и плоская от middleware: код и текст")
    func bothShapes() {
        #expect(ServerError(body: Data(RecordsReply.recordNotFound("r1").utf8))
            == ServerError(code: "NOT_FOUND", message: "Transaction not found: r1"))
        #expect(ServerError(body: Data(ServerReply.invalidToken.utf8))
            == ServerError(code: "INVALID_SHORTCUT_TOKEN", message: "Invalid shortcut capture token"))
        #expect(ServerError(body: Data(ServerReply.textTooLong.utf8))?.message
            == "Text is too long (maximum 2000 characters)")
    }

    @Test("код другого вида не мешает прочесть текст; без кода — только текст")
    func oddCode() {
        #expect(ServerError(body: Data(#"{"success":false,"error":{"code":404,"message":"x"}}"#.utf8))
            == ServerError(code: nil, message: "x"))
        #expect(ServerError(body: Data(#"{"success":false,"error":"y"}"#.utf8)) == ServerError(code: nil, message: "y"))
    }

    @Test("не ответ Kapelka — нет ошибки", arguments: ["", "Bad Gateway", "<html>Wi-Fi login</html>", #"{"error":{}}"#])
    func notKapelka(body: String) {
        #expect(ServerError(body: Data(body.utf8)) == nil)
    }
}
