import Foundation
import Testing
@testable import Kapelka

/// «Убрать» на «Записать» (FT-220, проверка): «Не нашёл операцию» и ошибка на сервере записи не создали, поэтому строку
/// можно убрать с телефона, ничего не потеряв. Записанное и то, что ещё может уйти, так не убрать.
@Suite("Убрать строку из очереди")
struct CaptureDismissTests {
    private static let notFound = ServerReply.saved(
        status: "no_transaction",
        title: "Не нашёл операцию",
        summary: "Не удалось распознать сумму или операцию"
    )

    @Test("«не нашёл операцию» и ошибка убираются и не возвращаются после перезапуска")
    func dismissedGoForGood() async throws {
        let harness = try QueueHarness(transport: FakeTransport([
            .http(200, body: Self.notFound),
            .http(400, body: ServerReply.textTooLong),
            .http(200),
        ]))
        let queue = harness.makeQueue()
        let hello = try await queue.add("привет")
        let refused = try await queue.add("кофе 250к")
        let saved = try await queue.add("кофе 25к")
        await queue.flush()

        #expect(try await queue.dismiss(hello.clientId))
        #expect(try await harness.makeQueue().dismiss(refused.clientId))

        #expect(try harness.store.load().captures.map(\.clientId) == [saved.clientId])
        #expect(await harness.makeQueue().state().captures.map(\.clientId) == [saved.clientId])
    }

    @Test("записанную, ждущую и ту, чей запрос в пути, не убрать")
    func othersStay() async throws {
        let harness = try QueueHarness(transport: FakeTransport(
            [.http(200, body: ServerReply.saved(status: "needs_review", title: "Нужно проверить"))],
            latency: .milliseconds(100)
        ))
        let queue = harness.makeQueue()
        let review = try await queue.add("перевёл 500к")
        await queue.flush()
        let waiting = try await queue.add("такси 30к")

        #expect(try await queue.dismiss(review.clientId) == false)

        async let sending: Void = queue.flush()
        #expect(await eventually { await harness.transport.requests.count == 2 })
        #expect(try await queue.dismiss(waiting.clientId) == false)
        await sending
        #expect(try await queue.dismiss(UUID()) == false)

        #expect(try harness.store.load().captures.map(\.clientId) == [review.clientId, waiting.clientId])
    }

    @Test("в строке: «Удалить» — у ждущей, «Убрать» — у «не нашёл операцию» и ошибки")
    func rowActions() {
        let kinds: [CaptureRow.Kind] = [.waiting, .sending, .saved, .needsReview, .notFound, .error]
        let rows = kinds.map { CaptureRow(id: UUID(), kind: $0, status: "", text: "", reason: nil) }

        #expect(rows.map(\.canDelete) == [true, false, false, false, false, false])
        #expect(rows.map(\.canDismiss) == [false, false, false, false, true, true])
    }
}
