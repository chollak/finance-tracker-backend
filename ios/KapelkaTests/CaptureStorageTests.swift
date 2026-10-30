import Foundation
import Testing
@testable import Kapelka

@Suite("Очередь на диске")
struct CaptureStorageTests {
    @Test("запись лежит на диске до первой попытки отправки")
    func writtenBeforeSending() async throws {
        let harness = try QueueHarness()
        let capture = try await harness.makeQueue().add("кофе 25к")

        #expect(try harness.store.load().captures == [capture])
        #expect(capture.state == .pending)
        #expect(await harness.transport.requests.isEmpty)
    }

    @Test("приложение убили сразу после ввода — при следующем запуске запись уходит с тем же clientId")
    func survivesKillAndRestart() async throws {
        let harness = try QueueHarness()
        let capture = try await harness.makeQueue().add("такси 18к")

        let restarted = harness.makeQueue()
        await restarted.flush()

        #expect(try await harness.transport.sentClientIds() == [capture.clientId.uuidString.lowercased()])
        #expect(try harness.store.load().captures.map(\.state) == [.sent])
    }

    @Test("фраза хранится без пробелов по краям")
    func trimsText() async throws {
        let capture = try await QueueHarness().makeQueue().add("  кофе 25к \n")
        #expect(capture.text == "кофе 25к")
    }

    @Test("пустая фраза и фраза длиннее 2000 символов в очередь не попадают")
    func refusesBadText() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()

        await #expect(throws: CaptureTextError.empty) { try await queue.add(" \n ") }
        await #expect(throws: CaptureTextError.tooLong) { try await queue.add(String(repeating: "а", count: 2001)) }
        _ = try await queue.add(String(repeating: "а", count: 2000))

        #expect(try harness.store.load().captures.count == 1)
    }

    @Test("отправленных хранится 50 последних; ждущие не удаляются")
    func keepsFiftyFinished() async throws {
        let harness = try QueueHarness()
        let queue = harness.makeQueue()
        for index in 1...55 {
            _ = try await queue.add("кофе \(index)")
        }
        await queue.flush()
        await harness.transport.script([.failure(.cannotConnectToHost)])
        for index in 56...58 {
            _ = try await queue.add("кофе \(index)")
        }
        await queue.flush()

        let captures = try harness.store.load().captures
        #expect(captures.filter { $0.state == .sent }.count == 50)
        #expect(captures.first?.text == "кофе 6")
        #expect(captures.filter { $0.state == .pending }.map(\.text) == ["кофе 56", "кофе 57", "кофе 58"])
    }

    @Test("файл очереди не открывается (до первой разблокировки) — новую запись не принимает и старые не затирает")
    func lockedFileIsNotOverwritten() async throws {
        let harness = try QueueHarness()
        _ = try await harness.makeQueue().add("кофе 25к")
        let path = harness.store.fileURL.path()
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path) }

        let launchedLocked = harness.makeQueue()
        await #expect(throws: QueueError.unavailable) { try await launchedLocked.add("такси 18к") }
        await launchedLocked.flush()
        #expect(await harness.transport.requests.isEmpty)

        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
        _ = try await launchedLocked.add("такси 18к")
        #expect(try harness.store.load().captures.map(\.text) == ["кофе 25к", "такси 18к"])
    }

    @Test("файл прошлой версии без новых полей читается: ждущие остаются ждущими")
    func readsOlderFile() throws {
        let harness = try QueueHarness()
        let older = """
            {"captures":[{"clientId":"3903229C-4ACB-4547-8620-13DC3B9FAA9E","text":"кофе 25к",\
            "capturedAt":815000000,"timeZoneIdentifier":"Asia/Tashkent","fieldFromTheFuture":1}]}
            """
        try Data(older.utf8).write(to: harness.store.fileURL)

        let state = try harness.store.load()

        #expect(state.captures.map(\.text) == ["кофе 25к"])
        #expect(state.captures.first?.state == .pending)
        #expect(state.captures.first?.attempts == 0)
        #expect(state.tokenRefused == false)
    }

    @Test("длина — в единицах UTF-16, как считает сервер")
    func lengthInUTF16() async throws {
        let queue = try QueueHarness().makeQueue()
        await #expect(throws: CaptureTextError.tooLong) { try await queue.add(String(repeating: "😀", count: 1001)) }
        _ = try await queue.add(String(repeating: "😀", count: 1000))
    }

    @Test("нечитаемый файл очереди откладывается рядом, а не затирается")
    func setsUnreadableFileAside() async throws {
        let harness = try QueueHarness()
        try Data("{ не json".utf8).write(to: harness.store.fileURL)

        let state = try harness.store.load()

        #expect(state.captures.isEmpty)
        let folder = harness.store.fileURL.deletingLastPathComponent()
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.path())
        #expect(names.contains { $0.hasPrefix("captures.unreadable-") })
    }
}
