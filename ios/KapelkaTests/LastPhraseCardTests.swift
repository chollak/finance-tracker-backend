import Foundation
import Testing
@testable import Kapelka

/// «Удалить» on the card of «Записать» (FT-252) by the phrase's state: waiting — off the phone, as the swipe on
/// «Записать»; on its way — no button; written — `DELETE` of each record through «Записи»' list, «Вернуть» on the shared
/// bar brings them all back, and after the bar the card says «Удалено». The card survives a restart; after a lost
/// answer it names the account by `accountId`.
@MainActor
@Suite("Записать: карточка — удалить, вернуть, перезапуск")
struct LastPhraseCardTests {
    private static let breadId = "c4b400f6-62a2-4fd0-8624-b71d7dcd23fa"
    private static let petrolId = "9df8b6e3-e460-4377-83cb-8c31806cf31b"
    private static let bread = RecordsReply.record(
        id: breadId, date: "2026-11-01", createdAt: "2026-11-01T09:00:01.000Z", description: "хлеб"
    )
    private static let petrol = RecordsReply.record(
        id: petrolId, date: "2026-11-01", createdAt: "2026-11-01T09:00:00.000Z", description: "бензин"
    )
    private static let phrase = "хлеб 5к и бензин 200к картой"

    private let timer = ManualTimer()
    private let suite = "ft252-tests-\(UUID().uuidString)"

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tashkent")!
        return calendar
    }

    /// Everything a card runs on; `card()` again over the same parts is the app started anew.
    @MainActor
    private final class Parts {
        let queue: QueueHarness
        let routes: RoutedTransport
        let records: RecordsHarness
        let list: RecordsList
        let memory: LastPhraseMemory
        let accountsAsked = Counter()
        let capture: CaptureQueue

        init(queue: QueueHarness, routes: RoutedTransport, records: RecordsHarness, list: RecordsList, memory: LastPhraseMemory) {
            self.queue = queue
            self.routes = routes
            self.records = records
            self.list = list
            self.memory = memory
            capture = queue.makeQueue()
        }

        /// What the edits route was asked, as «DELETE /api/transactions/x».
        func edits() async -> [String] {
            await routes.recordEdits.requests.map { "\($0.httpMethod ?? "") \($0.url?.path() ?? "")" }
        }
    }

    private func parts(
        capture replies: [FakeTransport.Reply] = [],
        routes: RoutedTransport = RoutedTransport()
    ) throws -> Parts {
        let records = try RecordsHarness(routes: routes)
        let clock = records.clock
        let timer = timer
        let list = RecordsList(
            feed: records.makeFeed(),
            now: { clock.now },
            calendar: calendar,
            wait: { await timer.wait($0) }
        )
        let defaults = try #require(UserDefaults(suiteName: suite))
        return Parts(
            queue: try QueueHarness(transport: FakeTransport(replies)),
            routes: routes,
            records: records,
            list: list,
            memory: LastPhraseMemory(defaults: defaults)
        )
    }

    private func card(_ parts: Parts) async -> LastPhraseCard {
        let feed = parts.records.makeFeed()
        let asked = parts.accountsAsked
        let card = LastPhraseCard(
            queue: parts.capture,
            records: parts.list,
            memory: parts.memory,
            accounts: {
                await asked.add()
                return try? await feed.accounts()
            }
        )
        card.queueChanged(await parts.capture.state())
        return card
    }

    private func shown(_ card: LastPhraseCard, at now: Date = Date()) -> LastPhrase? {
        card.shown(configured: true, saving: nil, now: now, calendar: calendar)
    }

    private func texts(_ card: LastPhraseCard) -> [String] {
        shown(card)?.lines.map(\.text) ?? []
    }

    private func refresh(_ card: LastPhraseCard, _ parts: Parts) async {
        card.queueChanged(await parts.capture.state())
    }

    private func cleanUp() {
        UserDefaults.standard.removePersistentDomain(forName: suite)
    }

    // MARK: Waiting

    @Test("ждёт — «Удалить» убирает с телефона: на сервер не уйдёт, карточка «Удалено с телефона», и после перезапуска")
    func removeWaiting() async throws {
        defer { cleanUp() }
        let parts = try parts(capture: [.failure(.notConnectedToInternet)])
        _ = try await parts.capture.add("кофе 25к")
        await parts.capture.flush()
        let card = await card(parts)
        let id = try #require(shown(card)?.id)
        #expect(shown(card)?.deletion == .fromPhone(id))

        await card.delete(.fromPhone(id))

        // At once, before the queue's next state reaches the screen
        #expect(texts(card) == ["Удалено с телефона — она уже уходила на сервер, проверь «Записи»"])
        await refresh(card, parts)
        #expect(await parts.capture.state().captures.isEmpty)
        #expect(shown(card)?.heard == "Услышал: кофе 25к")
        #expect(shown(card)?.deletion == nil)

        let restarted = await self.card(parts)
        #expect(texts(restarted) == ["Удалено с телефона — она уже уходила на сервер, проверь «Записи»"])

        _ = try await parts.capture.add("такси 18к")
        await refresh(restarted, parts)
        #expect(shown(restarted)?.heard == "Услышал: такси 18к")
    }

    @Test("запрос ушёл между показом и нажатием — не удаляет, говорит почему")
    func removeWhileSending() async throws {
        defer { cleanUp() }
        let parts = try parts(capture: [.hang])
        let capture = try await parts.capture.add("кофе 25к")
        let sending = Task { await parts.capture.flush() }
        defer { sending.cancel() }
        #expect(await eventually { await parts.capture.state().sendingId == capture.clientId })
        let card = await card(parts)

        await card.delete(.fromPhone(capture.clientId))

        #expect(await parts.capture.state().captures.count == 1)
        #expect(shown(card)?.note == "Уже отправляется — удалить можно, когда запишется")
        #expect(texts(card) == ["Отправляю…"])
    }

    // MARK: Written

    private func writtenParts(edits: [FakeTransport.Reply], page: [FakeTransport.Reply] = []) async throws -> Parts {
        let parts = try parts(
            capture: [.http(200, body: CaptureReplyBodies.breadAndPetrol)],
            routes: RoutedTransport(page: page, edits: edits)
        )
        _ = try await parts.capture.add(Self.phrase)
        await parts.capture.flush()
        return parts
    }

    private static let both = [
        RecordsNotice.Item(id: breadId, title: "хлеб"),
        RecordsNotice.Item(id: petrolId, title: "бензин"),
    ]

    @Test("записано — DELETE каждой записи, плашка «Удалено 2 · Вернуть»; плашка ушла — «Удалено», и после перезапуска")
    func deleteWritten() async throws {
        defer { cleanUp() }
        let parts = try await writtenParts(edits: [
            .http(200, body: RecordsReply.deleted(Self.breadId)),
            .http(200, body: RecordsReply.deleted(Self.petrolId)),
        ])
        let card = await card(parts)
        #expect(shown(card)?.deletion == .onServer(Self.both))

        await card.delete(.onServer(Self.both))

        #expect(await parts.edits() == [
            "DELETE /api/transactions/\(Self.breadId)",
            "DELETE /api/transactions/\(Self.petrolId)",
        ])
        #expect(parts.list.notice?.text == "Удалено 2")
        #expect(parts.list.notice?.restorable == [Self.breadId, Self.petrolId])
        // «Вернуть» is on the bar: the lines stay as written, nothing to open or delete
        #expect(texts(card) == [
            "Записал: хлеб · Продукты? · −5\u{00A0}000\u{00A0}сум · Карта",
            "Записал: бензин · Транспорт · −200\u{00A0}000\u{00A0}сум · Карта",
        ])
        #expect(shown(card)?.deletion == nil)
        #expect(shown(card)?.lines.compactMap(\.record) == [])

        #expect(await eventually { timer.durations == [.seconds(5)] })
        timer.fire()
        #expect(await eventually { @MainActor in parts.list.notice == nil })
        #expect(texts(card) == [
            "Удалено: хлеб · Продукты? · −5\u{00A0}000\u{00A0}сум · Карта",
            "Удалено: бензин · Транспорт · −200\u{00A0}000\u{00A0}сум · Карта",
        ])

        let restarted = await self.card(parts)
        #expect(shown(restarted)?.lines.map(\.kind) == [.deleted, .deleted])
        #expect(shown(restarted)?.deletion == nil)
    }

    @Test("«Вернуть» возвращает все записи фразы — карточка снова «Записал» с «Удалить»")
    func restoreAll() async throws {
        defer { cleanUp() }
        let parts = try await writtenParts(edits: [
            .http(200, body: RecordsReply.deleted(Self.breadId)),
            .http(200, body: RecordsReply.deleted(Self.petrolId)),
            .http(200, body: RecordsReply.one(Self.bread)),
            .http(200, body: RecordsReply.one(Self.petrol)),
        ])
        let card = await card(parts)
        await card.delete(.onServer(Self.both))

        await parts.list.restoreDeleted()

        #expect(parts.list.notice == nil)
        #expect(shown(card)?.lines.map(\.kind) == [.written, .written])
        #expect(shown(card)?.lines.compactMap(\.record) == [Self.breadId, Self.petrolId])
        #expect(shown(card)?.deletion == .onServer(Self.both))
        #expect(parts.memory.marks?.deleted == [])
    }

    @Test("без связи — ничего не меняется: «Нет связи — попробуй позже», «Удалить» на месте")
    func deleteOffline() async throws {
        defer { cleanUp() }
        let parts = try await writtenParts(edits: [.failure(.notConnectedToInternet), .failure(.notConnectedToInternet)])
        let card = await card(parts)

        await card.delete(.onServer(Self.both))

        #expect(parts.list.notice?.text == "Нет связи — попробуй позже")
        #expect(shown(card)?.lines.map(\.kind) == [.written, .written])
        #expect(shown(card)?.deletion == .onServer(Self.both))
    }

    @Test("уже удалены где-то ещё (404) — «Запись уже удалена», карточка «Удалено» сразу")
    func deleteGone() async throws {
        defer { cleanUp() }
        let parts = try await writtenParts(
            edits: [
                .http(404, body: RecordsReply.recordNotFound(Self.breadId)),
                .http(404, body: RecordsReply.recordNotFound(Self.petrolId)),
            ],
            page: [.http(200, body: RecordsReply.page([]))]
        )
        let card = await card(parts)

        await card.delete(.onServer(Self.both))

        #expect(parts.list.notice?.text == "Запись уже удалена")
        #expect(shown(card)?.lines.map(\.kind) == [.deleted, .deleted])
        #expect(shown(card)?.deletion == nil)
    }

    @Test("свайп во «Записях» по записи фразы — карточка тоже «Удалено» после плашки")
    func swipeInRecords() async throws {
        defer { cleanUp() }
        let parts = try await writtenParts(
            edits: [.http(200, body: RecordsReply.deleted(Self.breadId))],
            page: [.http(200, body: RecordsReply.page([Self.bread, Self.petrol]))]
        )
        let card = await card(parts)
        await parts.list.refresh()

        await parts.list.delete(Self.breadId)
        #expect(await eventually { timer.durations.count == 1 })
        timer.fire()
        #expect(await eventually { @MainActor in parts.list.notice == nil })

        #expect(shown(card)?.lines.map(\.kind) == [.deleted, .written])
        #expect(shown(card)?.deletion == .onServer([RecordsNotice.Item(id: Self.petrolId, title: "бензин")]))
    }

    @Test("новая фраза — отметки прошлой не действуют")
    func newPhrase() async throws {
        defer { cleanUp() }
        let parts = try await writtenParts(edits: [
            .http(200, body: RecordsReply.deleted(Self.breadId)),
            .http(200, body: RecordsReply.deleted(Self.petrolId)),
        ])
        let card = await card(parts)
        await card.delete(.onServer(Self.both))

        _ = try await parts.capture.add("кофе 25к")
        await refresh(card, parts)

        #expect(shown(card)?.heard == "Услышал: кофе 25к")
        #expect(shown(card)?.lines.map(\.kind) == [.sending])
    }

    // MARK: Voice

    @Test("голос: «Услышал: …» и «Отправляю…», пока фраза пишется на телефон; ответ сервера — «Записал: …»")
    func voice() async throws {
        defer { cleanUp() }
        let parts = try parts(capture: [.http(200, body: CaptureReplyBodies.coffee)])
        let card = await card(parts)
        let speech = FakeSpeech()
        let gate = Gate()
        let queue = parts.capture
        let voice = VoiceCapture(
            system: speech, listener: speech, pause: .milliseconds(150), silenceAtStart: .seconds(5)
        ) { phrase in
            await gate.wait()
            try await queue.add(phrase)
        }
        // As `AppModel.lastPhrase` reads the microphone
        func shownNow() -> LastPhrase? {
            card.shown(
                configured: true, saving: voice.phase == .saving ? voice.transcript : nil, now: Date(), calendar: calendar
            )
        }

        voice.start()
        #expect(await eventually { await speech.isListening })
        speech.hear("кофе 45")
        #expect(await eventually { @MainActor in voice.phase == .saving })
        #expect(shownNow()?.heard == "Услышал: кофе 45")
        #expect(shownNow()?.lines.map(\.text) == ["Отправляю…"])

        gate.open()
        #expect(await eventually { @MainActor in voice.phase == .idle })
        await queue.flush()
        await refresh(card, parts)
        #expect(shownNow()?.heard == "Услышал: кофе 45")
        #expect(shownNow()?.lines.map(\.text) == ["Записал: кофе · Кафе · −45\u{00A0}000\u{00A0}сум · Карта"])
    }

    // MARK: After a lost answer

    @Test("повтор без имени счёта — имена из GET /api/accounts, один раз на фразу")
    func accountsForRepeat() async throws {
        defer { cleanUp() }
        let parts = try parts(
            capture: [.failure(.timedOut), .http(200, body: Self.breadAndPetrolRepeated)],
            routes: RoutedTransport(accounts: [
                .http(200, body: RecordsReply.accounts([RecordsReply.account(id: "3cacdec0-0136-11a2-62a2-12e4e96411cf")])),
            ])
        )
        _ = try await parts.capture.add(Self.phrase)
        await parts.capture.flush()
        let card = await card(parts)
        #expect(await parts.accountsAsked.count == 0)

        await parts.capture.flush()
        await refresh(card, parts)
        await refresh(card, parts)

        #expect(await eventually { @MainActor in
            self.texts(card).first == "Записал: хлеб · Продукты · −5\u{00A0}000\u{00A0}сум · Карта"
        })
        #expect(await parts.accountsAsked.count == 1)
        #expect(shown(card)?.footnote == LastPhrase.repeatedFootnote)
    }

    /// «хлеб 5к и бензин 200к картой» sent again after a lost answer: the records from the database, without the
    /// account's name and the assumptions (`breadAndPetrolRepeatedAfterDeletion` without the deletion).
    private static let breadAndPetrolRepeated = CaptureReplyBodies.breadAndPetrolRepeatedAfterDeletion
        .replacingOccurrences(of: #","deletedAt":"2026-10-31T21:31:57.397Z""#, with: "")
}

private actor Counter {
    private(set) var count = 0

    func add() {
        count += 1
    }
}
