import Foundation
import Testing
@testable import Kapelka

/// The journal of command runs on the phone (#241): each line appended to a file, a run without an end marked
/// «оборвана iOS» by the next process, the last 200 runs kept. It never fails a command.
@Suite("Журнал команд")
struct CommandJournalTests {
    @Test("запуск: начало, шаги с мс от начала, конец с длительностью")
    func finishedRun() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal()

        let run = await journal.begin(.recordPayment)
        harness.uptime.advance(by: .milliseconds(15))
        await journal.step(run, "в очереди")
        harness.uptime.advance(by: .milliseconds(1819))
        await journal.finish(run)

        let runs = await journal.runs()
        #expect(runs == [
            JournalRun(
                id: run,
                command: .recordPayment,
                startedAt: harness.clock.now,
                steps: [.init(ms: 0, text: "начало"), .init(ms: 15, text: "в очереди")],
                outcome: .finished(ms: 1834),
                launch: JournalLaunch(cold: true, sinceProcessStartMs: nil)
            ),
        ])
    }

    @Test("начало: холодный ли запуск процесса и сколько прошло от его старта; дальше — «процесс уже работал»")
    func launch() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal(processStart: harness.clock.now.addingTimeInterval(-0.34))

        let first = await journal.begin(.recordPayment)
        harness.clock.advance(by: 7200)
        let second = await journal.begin(.sendQueue)

        let launches = await journal.runs().map(\.launch)
        #expect(launches == [
            JournalLaunch(cold: false, sinceProcessStartMs: 7_200_340),
            JournalLaunch(cold: true, sinceProcessStartMs: 340),
        ])
        #expect(first != second)
    }

    @Test("приложение открыли раньше команды — команда уже не холодная")
    func openedBeforeCommand() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal()

        await journal.tidy()
        _ = await journal.begin(.recordExpense)

        #expect(await journal.runs().first?.launch == JournalLaunch(cold: false, sinceProcessStartMs: nil))
    }

    @Test("iOS отменил команду, но процесс оставил — шаг «iOS отменил команду» перед концом")
    func cancelledCommand() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal()

        let run = await Task {
            let run = await journal.begin(.recordPayment)
            await journal.step(run, "в очереди")
            withUnsafeCurrentTask { $0?.cancel() }
            await journal.finish(run)
            return run
        }.value
        let failed = await Task {
            let run = await journal.begin(.recordPayment)
            withUnsafeCurrentTask { $0?.cancel() }
            await journal.fail(run, "очередь закрыта")
            return run
        }.value

        let runs = await journal.runs()
        #expect(runs.first { $0.id == run }?.texts == ["начало", "в очереди", "iOS отменил команду"])
        #expect(runs.first { $0.id == run }?.outcome == .finished(ms: 0))
        #expect(runs.first { $0.id == failed }?.texts == ["начало", "iOS отменил команду"])
        // Not cancelled — no such step
        let plain = await journal.begin(.sendQueue)
        await journal.finish(plain)
        #expect(await journal.runs().first?.texts == ["начало"])
    }

    @Test("ошибка — её текст и сколько шла команда")
    func failedRun() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal()

        let run = await journal.begin(.recordPayment)
        harness.uptime.advance(by: .milliseconds(20))
        await journal.fail(run, "очередь на телефоне пока закрыта")

        let saved = try #require(await journal.runs().first)
        #expect(saved.outcome == .failed(ms: 20, message: "очередь на телефоне пока закрыта"))
    }

    @Test("новые сверху; запуск этого процесса без конца — «идёт», а не «оборвана»")
    func newestFirst() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal()

        let first = await journal.begin(.sendQueue)
        await journal.finish(first)
        harness.clock.advance(by: 60)
        let second = await journal.begin(.recordPayment)

        let runs = await journal.runs()
        #expect(runs.map(\.id) == [second, first])
        #expect(runs.map(\.outcome) == [.going, .finished(ms: 0)])
    }

    @Test("команда только дописывает: ни первая в процессе, ни следующие файл не читают и не переписывают")
    func appendOnly() async throws {
        let harness = try JournalHarness()
        // A run an earlier process left without an end: the first command does not go looking for it
        _ = await harness.makeJournal().begin(.recordPayment)
        let storage = CountingStorage(harness.file)
        let journal = harness.makeJournal(storage: storage)
        let before = try harness.file.read()

        let run = await journal.begin(.recordPayment)
        await journal.step(run, "в очереди")
        await journal.step(run, "отправка: записано")
        await journal.finish(run)
        let second = await journal.begin(.sendQueue)
        await journal.finish(second)

        #expect(storage.reads == 0)
        #expect(storage.replaces == 0)
        #expect(storage.appends == 6)
        #expect(try harness.file.read().starts(with: before))
    }

    @Test("запуск без конца: на экране «оборвана iOS» с последним шагом сразу, в файле — при открытии приложения")
    func interruptedOnNextCommand() async throws {
        let harness = try JournalHarness()
        let killed = harness.makeJournal()
        let run = await killed.begin(.recordPayment)
        await killed.step(run, "в очереди · 1")
        await killed.step(run, "отправка: сервер не ответил")

        // iOS killed the process; the next command starts a new one
        let next = harness.makeJournal()
        let later = await next.begin(.recordPayment)

        let runs = await next.runs()
        #expect(runs.map(\.id) == [later, run])
        #expect(runs.last?.outcome == .interrupted(lastStep: "отправка: сервер не ответил"))
        #expect(try !harness.lines().contains { $0.contains("\"interrupted\"") })

        await next.tidy()
        #expect(try harness.lines().contains { $0.contains("\"interrupted\"") })
    }

    @Test("при открытии приложения файл читается один раз за процесс")
    func tidyReadsOnce() async throws {
        let harness = try JournalHarness()
        let storage = CountingStorage(harness.file)
        let journal = harness.makeJournal(storage: storage)
        await journal.finish(await journal.begin(.sendQueue))

        await journal.tidy()
        await journal.tidy()

        #expect(storage.reads == 1)
    }

    @Test("строка, оборванная на середине записи, не склеивается со следующей: следующий запуск читается")
    func brokenLastLine() async throws {
        let harness = try JournalHarness()
        let earlier = harness.makeJournal()
        await earlier.finish(await earlier.begin(.recordPayment))
        // The process killed in the middle of writing a line: its line break came first, nothing after it
        try harness.file.append(Data("\n{\"run\":\"5D0C7A1E-3B2F-4C8A-9E61-0F2B7D4A8C13\",\"event\":\"st".utf8))

        let next = harness.makeJournal()
        let run = await next.begin(.sendQueue)
        await next.finish(run)

        let runs = await next.runs()
        #expect(runs.map(\.command) == [.sendQueue, .recordPayment])
        #expect(runs.map(\.outcome) == [.finished(ms: 0), .finished(ms: 0)])
        #expect(try harness.lines().count == 5)
    }

    @Test("… и при открытии приложения; запуск, оборванный сразу, — после «начало»")
    func interruptedOnOpening() async throws {
        let harness = try JournalHarness()
        let killed = harness.makeJournal()
        let run = await killed.begin(.recordExpense)

        let opened = harness.makeJournal()
        await opened.tidy()

        #expect(await opened.runs().first?.outcome == .interrupted(lastStep: "начало"))
        let interrupted = try harness.lines().filter { $0.contains("\"interrupted\"") }
        #expect(interrupted.count == 1)
        #expect(interrupted.first?.contains(run.uuidString) == true)
    }

    @Test("оборванный запуск помечается один раз")
    func interruptedOnce() async throws {
        let harness = try JournalHarness()
        _ = await harness.makeJournal().begin(.recordPayment)

        let next = harness.makeJournal()
        await next.tidy()
        await next.finish(await next.begin(.sendQueue))
        await harness.makeJournal().tidy()

        #expect(try harness.lines().count { $0.contains("\"interrupted\"") } == 1)
    }

    @Test("две команды разом (оплата во время «Отправить очередь») — свои id, одна другую не обрывает")
    func twoRunsAtOnce() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal()

        let sending = await journal.begin(.sendQueue)
        let paying = await journal.begin(.recordPayment)
        await journal.step(paying, "в очереди")
        await journal.step(sending, "отправка: всё отправлено")
        await journal.tidy()
        await journal.finish(sending)
        await journal.finish(paying)

        let runs = await journal.runs()
        #expect(sending != paying)
        #expect(runs.map(\.id) == [paying, sending])
        #expect(runs.map(\.texts) == [["начало", "в очереди"], ["начало", "отправка: всё отправлено"]])
        #expect(runs.allSatisfy { $0.outcome == .finished(ms: 0) })
    }

    @Test("хранятся последние 200 запусков: обрезка при открытии приложения, не во время команды")
    func keepsLast200() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal()
        var ids: [UUID] = []
        for _ in 0 ..< 205 {
            let run = await journal.begin(.recordPayment)
            await journal.finish(run)
            ids.append(run)
        }
        #expect(try harness.lines().count == 410)

        await harness.makeJournal().tidy()

        let runs = await journal.runs()
        #expect(runs.count == CommandJournal.keptRuns)
        #expect(runs.map(\.id) == Array(ids.suffix(200).reversed()))
        #expect(try harness.lines().count == 400)
    }

    @Test("файл защищён, как очередь: доступен после первой разблокировки — и создание, и обрезка")
    func fileProtection() {
        // The simulator keeps no protection class on a file: the attribute itself is seen only on the iPhone
        #expect(JournalFile.protection == CaptureFileStore.protection)
        #expect(CaptureFileStore.protection == .completeFileProtectionUntilFirstUserAuthentication)
    }

    @Test("журнал не пишется — команда идёт дальше: ни одна запись не бросает, читать нечего")
    func brokenJournal() async {
        let journal = CommandJournal(storage: BrokenStorage(), now: { Date() }, uptime: { .zero })

        let run = await journal.begin(.recordPayment)
        await journal.step(run, "в очереди")
        await journal.fail(run, "ошибка")
        await journal.tidy()

        #expect(await journal.runs().isEmpty)
    }

    @Test("строка, которую не прочитать (оборванная запись, сборка новее), пропускается")
    func unreadableLine() async throws {
        let harness = try JournalHarness()
        let journal = harness.makeJournal()
        let run = await journal.begin(.sendQueue)
        // As the journal writes a line: a line break first
        try harness.file.append(Data("\n{\"run\":\"оборвано\n{\"event\":\"future\"}".utf8))
        await journal.finish(run)

        let outcomes = await journal.runs().map(\.outcome)
        #expect(outcomes == [.finished(ms: 0)])
    }

    @Test("файл — в той же папке, что очередь: команда и приложение видят один журнал")
    func nextToQueue() {
        #expect(
            JournalFile.inApplicationSupport.fileURL.deletingLastPathComponent()
                == CaptureFileStore.inApplicationSupport.fileURL.deletingLastPathComponent()
        )
    }
}
