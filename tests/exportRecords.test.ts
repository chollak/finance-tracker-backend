import { TelegramError } from 'telegraf';
import { AccountModule } from '../src/modules/account/accountModule';
import { Account } from '../src/modules/account/domain/account';
import { AccountMove } from '../src/modules/account/domain/accountMove';
import { ExportModule } from '../src/modules/export/exportModule';
import { buildRecordsCsv, exportFileName } from '../src/modules/export/domain/recordsCsv';
import { ChatClosedError, ChatFileSender, RecordsFile } from '../src/modules/export/domain/exportPorts';
import { exportCaption, TelegramChatFileSender } from '../src/modules/export/infrastructure/TelegramChatFileSender';
import { createExportRoutes } from '../src/modules/export/presentation/exportController';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { todayDateOnly } from '../src/shared/domain/dates/dateOnly';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';
import { recordsOn } from './helpers/records';
import { startTestServer, TestServer } from './helpers/testServer';

/**
 * FT-126: «Скачать все записи» in «Ещё» (boards «„Ещё“ — разделы и настройки», «Выгрузка записей»). A CSV of every
 * record and move that is not deleted — date, type, amount, currency, account, category, note — sent to the chat
 * with the bot in Telegram (sendDocument) and downloaded in a browser. A second press while the first file is on
 * its way sends nothing.
 */

const sum = (value: number) => value * 100;
const BOM = '﻿';
const HEADER = 'Дата;Тип;Сумма;Валюта;Счёт;Категория;Заметка;Курс';

/** The data lines of a CSV: without the byte order mark, split by CRLF, the last empty line dropped. */
const lines = (text: string) => text.replace(BOM, '').split('\r\n').filter(Boolean);

const account = (overrides: Partial<Account>): Account => ({
  id: 'card', userId: 'u1', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-09-01',
  openingAt: null, isHidden: false, sortOrder: 20, ...overrides,
});

const record = (overrides: Partial<Transaction>): Transaction => ({
  id: 'r', userId: 'u1', date: '2026-10-10', type: 'expense', amount: 0, amountMinor: 0, currency: 'UZS', accountId: 'card',
  category: 'Другое', description: '', createdAt: '2026-10-10T08:00:00.000Z', ...overrides,
});

const move = (overrides: Partial<AccountMove>): AccountMove => ({
  id: 'm', userId: 'u1', kind: 'transfer', fromAccountId: 'card', toAccountId: 'cash', fromAmountMinor: 0, toAmountMinor: 0,
  dealRateMinor: null, cbuRateMinor: null, date: '2026-10-10', note: null, createdAt: new Date('2026-10-10T08:00:00.000Z'),
  deletedAt: null, ...overrides,
});

describe('the CSV of all records (FT-126)', () => {
  const accounts = [
    account({}),
    account({ id: 'cash', name: 'Наличные', kind: 'cash', sortOrder: 10 }),
    account({ id: 'usd', name: 'Доллары', currency: 'USD', sortOrder: 30 }),
    account({ id: 'old', name: 'Старая карта', isHidden: true, sortOrder: 40 }),
  ];

  it('has the columns the task names, for Excel and Google Sheets in Russian: «;», a decimal comma, UTF-8 with a BOM', () => {
    const { text, count } = buildRecordsCsv({
      accounts,
      moves: [],
      records: [
        record({ id: 'coffee', amountMinor: sum(24000), category: 'Кафе', description: 'кофе с собой', date: '2026-10-12' }),
        record({ id: 'salary', type: 'income', amountMinor: sum(9000000), category: 'Зарплата', description: 'зарплата', date: '2026-09-28' }),
        record({ id: 'taxi', amountMinor: 1250, currency: 'USD', accountId: 'usd', category: 'Транспорт', description: 'такси в аэропорт', date: '2026-10-01' }),
        record({ id: 'gift', amountMinor: 305, currency: 'USD', accountId: 'old', category: 'Подарки', date: '2026-10-02' }),
      ],
    });

    expect(text.startsWith(BOM)).toBe(true);
    expect(text.endsWith('\r\n')).toBe(true);
    // Oldest first, as a ledger reads; expenses with «−», income with «+» left out as a spreadsheet writes numbers
    expect(lines(text)).toEqual([
      HEADER,
      '2026-09-28;Доход;9000000;UZS;Карта;Зарплата;зарплата;',
      '2026-10-01;Расход;-12,50;USD;Доллары;Транспорт;такси в аэропорт;',
      '2026-10-02;Расход;-3,05;USD;Старая карта;Подарки;;',
      '2026-10-12;Расход;-24000;UZS;Карта;Кафе;кофе с собой;',
    ]);
    expect(count).toBe(4);
  });

  it('writes a transfer and an exchange as money leaving one account and arriving on the other; an adjustment on its account', () => {
    const { text, count } = buildRecordsCsv({
      accounts,
      records: [],
      moves: [
        move({ id: 't', fromAccountId: 'card', toAccountId: 'cash', fromAmountMinor: sum(300000), toAmountMinor: sum(300000), date: '2026-10-05', note: 'на рынок' }),
        move({
          id: 'x', kind: 'exchange', fromAccountId: 'usd', toAccountId: 'card', fromAmountMinor: 10000, toAmountMinor: sum(1260000),
          dealRateMinor: 1260000, cbuRateMinor: 1265000, date: '2026-10-06',
        }),
        move({ id: 'a', kind: 'adjustment', fromAccountId: null, toAccountId: 'cash', fromAmountMinor: null, toAmountMinor: sum(-20000), date: '2026-10-07' }),
      ],
    });

    expect(lines(text).slice(1)).toEqual([
      '2026-10-05;Перевод;-300000;UZS;Карта;;на рынок;',
      '2026-10-05;Перевод;300000;UZS;Наличные;;на рынок;',
      // The deal rate, сум for $1, on both lines of the exchange
      '2026-10-06;Обмен;-100;USD;Доллары;;;12600',
      '2026-10-06;Обмен;1260000;UZS;Карта;;;12600',
      '2026-10-07;Корректировка;-20000;UZS;Наличные;;;',
    ]);
    // A transfer is one operation, though it takes two lines
    expect(count).toBe(3);
  });

  it('orders one day by the time things were written, and keeps the day of records stored with a full moment', () => {
    const { text } = buildRecordsCsv({
      accounts,
      records: [
        record({ id: 'late', amountMinor: sum(2), description: 'вечер', date: '2026-10-10', createdAt: '2026-10-10T15:00:00.000Z' }),
        record({ id: 'old', amountMinor: sum(1), description: 'до FT-100', date: '2026-10-10T04:00:00.000Z', createdAt: '2026-10-10T04:00:00.000Z' }),
      ],
      moves: [move({ id: 'noon', fromAmountMinor: sum(3), toAmountMinor: sum(3), date: '2026-10-10', createdAt: new Date('2026-10-10T07:00:00.000Z') })],
    });

    expect(lines(text).slice(1).map(line => line.split(';').slice(0, 3).join(';'))).toEqual([
      '2026-10-10;Расход;-1',
      '2026-10-10;Перевод;-3',
      '2026-10-10;Перевод;3',
      '2026-10-10;Расход;-2',
    ]);
  });

  it('quotes a note with «;», quotes or a line break, and keeps a note that looks like a formula as text', () => {
    const { text } = buildRecordsCsv({
      accounts: [account({ name: 'Карта; основная' })],
      moves: [],
      records: [
        record({ id: 'a', amountMinor: sum(1), category: 'Кафе', description: 'обед; кофе', date: '2026-10-01' }),
        record({ id: 'b', amountMinor: sum(1), category: 'Кафе', description: 'кафе "Рохат"\nс Лолой', date: '2026-10-02' }),
        record({ id: 'c', amountMinor: sum(1), category: 'Кафе', description: '=HYPERLINK("x")', date: '2026-10-03' }),
      ],
    });

    const body = text.replace(BOM, '').split('\r\n').slice(1).join('\r\n');
    expect(body).toBe([
      '2026-10-01;Расход;-1;UZS;"Карта; основная";Кафе;"обед; кофе";',
      '2026-10-02;Расход;-1;UZS;"Карта; основная";Кафе;"кафе ""Рохат""\nс Лолой";',
      '2026-10-03;Расход;-1;UZS;"Карта; основная";Кафе;"\'=HYPERLINK(""x"")";',
      '',
    ].join('\r\n'));
  });

  it('is called after the day it was made', () => {
    expect(exportFileName('2026-10-14')).toBe('kapelka-2026-10-14.csv');
  });
});

describe('export from the database and its routes (FT-126)', () => {
  let db: TestDatabase;
  let records: ReturnType<typeof recordsOn>;
  let accounts: AccountModule;
  let userModule: UserModule;
  let sent: Array<{ chatId: string; file: RecordsFile }>;
  let sender: jest.Mocked<ChatFileSender>;
  let exportModule: ExportModule;
  let server: TestServer;

  const TELEGRAM_ID = 4242;

  beforeEach(async () => {
    db = await openMigratedDatabase();
    records = recordsOn(db.dataSource);
    accounts = new AccountModule(records.accountRepository, undefined, records.moveRepository);
    accounts.setCbuRates({ cbuRateOn: jest.fn().mockResolvedValue({ rateMinor: 1265000 }) });
    userModule = new UserModule(new SqliteUserRepository(db.dataSource), new SqliteUserSettingsRepository(db.dataSource));
    sent = [];
    sender = { sendFile: jest.fn(async (chatId: string, file: RecordsFile) => { sent.push({ chatId, file }); }) };
    exportModule = new ExportModule(
      {
        records: userId => records.repository.findByUserId(userId),
        moves: userId => records.moveRepository.findByUserId(userId),
        accounts: userId => records.accountRepository.findByUserId(userId),
      },
      sender
    );
    server = await startTestServer({ '/export': createExportRoutes(exportModule, userModule) });
  });

  afterEach(async () => {
    await server.close();
    await db.close();
  });

  async function signedInUser(): Promise<string> {
    const user = await userModule.getGetOrCreateUserUseCase().execute({ telegramId: String(TELEGRAM_ID) });
    return user.id;
  }

  async function spend(userId: string, amount: number, description: string, date: string, extra: Partial<Transaction> = {}) {
    const created = await records.create.execute({ userId, amount, type: 'expense', category: 'Кафе', description, date, ...extra });
    if (!created.success) throw created.error;
    return created.data;
  }

  async function download(on: TestServer = server) {
    const res = await fetch(`${on.baseUrl}/api/export`, { headers: { 'X-Dev-User-Id': String(TELEGRAM_ID) } });
    const bytes = Buffer.from(await res.arrayBuffer());
    // fetch's text() drops a byte order mark; the bytes keep it
    return { status: res.status, headers: res.headers, bytes, text: bytes.toString('utf8') };
  }

  it('the file has the records and moves that are not deleted, and nobody else\'s', async () => {
    const userId = await signedInUser();
    const [card] = await accounts.getBook().listForUser(userId);
    // «Карта» opens today; moved back so the moves of October count on it
    await db.dataSource.query(`UPDATE accounts SET opening_date = ? WHERE id = ?`, ['2026-10-01', card.id]);
    const cash = await accounts.getCreateAccountUseCase().execute({ userId, body: { name: 'Наличные', kind: 'cash', currency: 'UZS', openingDate: '2026-10-01' } });
    if (!cash.success) throw cash.error;

    await spend(userId, 24000, 'кофе', '2026-10-12');
    const deleted = await spend(userId, 99000, 'удалённая', '2026-10-12');
    await records.repository.delete(deleted);
    const archived = await spend(userId, 77000, 'в архиве', '2026-10-12');
    await records.repository.archive(archived);
    await spend('someone-else', 55000, 'чужая', '2026-10-12');

    const kept = await accounts.getCreateMoveUseCase().execute({ userId, body: { kind: 'transfer', fromAccountId: card.id, toAccountId: cash.data.id, amountMinor: sum(300000), date: '2026-10-13' } });
    const gone = await accounts.getCreateMoveUseCase().execute({ userId, body: { kind: 'transfer', fromAccountId: card.id, toAccountId: cash.data.id, amountMinor: sum(1000), date: '2026-10-13' } });
    if (!kept.success || !gone.success) throw new Error('moves not recorded');
    await accounts.getSetMoveDeletedUseCase().execute({ userId, moveId: gone.data.id, deleted: true });

    const result = await download();

    expect(result.status).toBe(200);
    expect(lines(result.text)).toEqual([
      HEADER,
      '2026-10-12;Расход;-24000;UZS;Карта;Кафе;кофе;',
      '2026-10-13;Перевод;-300000;UZS;Карта;;;',
      '2026-10-13;Перевод;300000;UZS;Наличные;;;',
    ]);
  });

  it('GET /api/export: a download named after today, with how many records it has', async () => {
    const userId = await signedInUser();
    await spend(userId, 24000, 'кофе', '2026-10-12');
    await spend(userId, 18000, 'такси', '2026-10-13');

    const result = await download();

    expect(result.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(result.headers.get('content-disposition')).toBe(`attachment; filename="kapelka-${todayDateOnly()}.csv"`);
    expect(result.headers.get('x-export-count')).toBe('2');
    expect([...result.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    // Nothing goes to the chat from a browser
    expect(sender.sendFile).not.toHaveBeenCalled();
  });

  it('takes the user only from authentication', async () => {
    expect((await server.request('GET', '/api/export')).status).toBe(401);
    expect((await server.request('POST', '/api/export/chat')).status).toBe(401);
  });

  it('POST /api/export/chat sends the file to the private chat of the signed-in user and says what it sent', async () => {
    const userId = await signedInUser();
    await spend(userId, 24000, 'кофе', '2026-10-12');

    const result = await server.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID });

    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ fileName: `kapelka-${todayDateOnly()}.csv`, count: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe(String(TELEGRAM_ID));
    expect(sent[0].file).toMatchObject({ fileName: `kapelka-${todayDateOnly()}.csv`, count: 1, date: todayDateOnly() });
    expect(lines(sent[0].file.text)).toEqual([HEADER, '2026-10-12;Расход;-24000;UZS;Карта;Кафе;кофе;']);
  });

  it('a second press while the file is on its way sends no second file', async () => {
    const userId = await signedInUser();
    await spend(userId, 24000, 'кофе', '2026-10-12');
    let release!: () => void;
    sender.sendFile.mockImplementationOnce(async (chatId, file) => {
      sent.push({ chatId, file });
      await new Promise<void>(resolve => { release = resolve; });
    });

    const first = server.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID });
    await waitFor(() => sent.length === 1);
    const second = await server.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID });
    release();

    expect(second.status).toBe(409);
    expect((await first).status).toBe(200);
    expect(sent).toHaveLength(1);

    // Once it is sent, the next press makes a new file
    expect((await server.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID })).status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it('with nothing recorded, no empty file goes to the chat', async () => {
    await signedInUser();

    const result = await server.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID });

    expect(result.status).toBe(200);
    expect(result.body.data.count).toBe(0);
    expect(sender.sendFile).not.toHaveBeenCalled();
  });

  it('says when the bot cannot write to the user, and when Telegram did not answer; the next press tries again', async () => {
    const userId = await signedInUser();
    await spend(userId, 24000, 'кофе', '2026-10-12');
    sender.sendFile.mockRejectedValueOnce(new ChatClosedError());
    sender.sendFile.mockRejectedValueOnce(new Error('fetch failed'));

    const closed = await server.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID });
    const offline = await server.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID });
    const retried = await server.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID });

    expect([closed.status, closed.body.error.code]).toEqual([422, 'BOT_CHAT_CLOSED']);
    expect([offline.status, offline.body.error.code]).toEqual([502, 'EXTERNAL_SERVICE_ERROR']);
    // Telegram's own message (it names the Bot API address) stays in the log
    expect(JSON.stringify(offline.body)).not.toContain('fetch failed');
    expect(retried.status).toBe(200);
  });

  it('without a bot token the chat is out of reach; the download still works', async () => {
    const userId = await signedInUser();
    await spend(userId, 24000, 'кофе', '2026-10-12');
    const withoutBot = new ExportModule(
      { records: id => records.repository.findByUserId(id), moves: id => records.moveRepository.findByUserId(id), accounts: id => records.accountRepository.findByUserId(id) },
      undefined
    );
    const other = await startTestServer({ '/export': createExportRoutes(withoutBot, userModule) });
    try {
      expect((await other.request('POST', '/api/export/chat', { devUser: TELEGRAM_ID })).status).toBe(502);
      expect((await download(other)).status).toBe(200);
    } finally {
      await other.close();
    }
  });
});

describe('the file in the chat with the bot (FT-126)', () => {
  const file: RecordsFile = { fileName: 'kapelka-2026-10-14.csv', text: `${BOM}${HEADER}\r\n`, count: 205, date: '2026-10-14' };

  it('goes as a document with its name and a line saying what is in it', async () => {
    const telegram = { sendDocument: jest.fn().mockResolvedValue({}) };

    await new TelegramChatFileSender(telegram).sendFile('4242', file);

    expect(telegram.sendDocument).toHaveBeenCalledTimes(1);
    const [chatId, document, extra] = telegram.sendDocument.mock.calls[0];
    expect(chatId).toBe('4242');
    expect(document.filename).toBe('kapelka-2026-10-14.csv');
    expect(Buffer.isBuffer(document.source) && document.source.toString('utf8')).toBe(file.text);
    expect(extra).toEqual({ caption: '205 записей на 14 октября — таблица CSV, её откроет Excel или Google Таблицы.' });
  });

  it('counts records in Russian', () => {
    expect(exportCaption(1, '2026-01-01')).toBe('1 запись на 1 января — таблица CSV, её откроет Excel или Google Таблицы.');
    expect(exportCaption(22, '2026-05-09')).toBe('22 записи на 9 мая — таблица CSV, её откроет Excel или Google Таблицы.');
    expect(exportCaption(111, '2026-12-31')).toBe('111 записей на 31 декабря — таблица CSV, её откроет Excel или Google Таблицы.');
  });

  it('a chat the bot may not write to (blocked, never started) is told apart from a failure', async () => {
    const blocked = { sendDocument: jest.fn().mockRejectedValue(new TelegramError({ error_code: 403, description: 'Forbidden: bot was blocked by the user' })) };
    const missing = { sendDocument: jest.fn().mockRejectedValue(new TelegramError({ error_code: 400, description: 'Bad Request: chat not found' })) };
    const down = { sendDocument: jest.fn().mockRejectedValue(new Error('fetch failed')) };

    await expect(new TelegramChatFileSender(blocked).sendFile('1', file)).rejects.toBeInstanceOf(ChatClosedError);
    await expect(new TelegramChatFileSender(missing).sendFile('1', file)).rejects.toBeInstanceOf(ChatClosedError);
    await expect(new TelegramChatFileSender(down).sendFile('1', file)).rejects.not.toBeInstanceOf(ChatClosedError);
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
