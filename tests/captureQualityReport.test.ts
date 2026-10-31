import 'reflect-metadata';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { main } from '../scripts/capture-quality-report';

/**
 * The capture quality report (FT-217) on a real SQLite file built by the app's own migrations: every source, edits,
 * flags, a day with only a deleted record, an Apple Pay payment without a matched card. The numbers it prints are
 * asserted, and so is what it must never do — write to the file or print an amount, a note or a text.
 */

const SECRET = 'СЕКРЕТ';
const NOW = new Date('2026-11-06T07:00:00Z'); // 12:00 in Tashkent

interface Row {
  id: string;
  user?: string;
  source: string | null;
  /** createdAt as SQLite keeps it, UTC. */
  created: string;
  updated?: string;
  deleted?: boolean;
  amountMinor?: number;
  currency?: 'UZS' | 'USD';
  account?: string;
  category?: string;
  semanticType?: string;
  needsReview?: boolean;
  parse?: Record<string, unknown>;
}

/** Noon of a Tashkent day, in UTC. */
const noon = (day: string, plusMinutes = 0) => {
  const moment = new Date(`${day}T07:00:00Z`);
  moment.setUTCMinutes(moment.getUTCMinutes() + plusMinutes);
  return moment.toISOString().replace('T', ' ').slice(0, 19);
};

const parse = (extra: Record<string, unknown> = {}) => ({
  amount: 31415.92,
  category: 'Кафе',
  categoryId: 'cat-cafe',
  type: 'expense',
  semanticType: 'expense',
  needsReview: false,
  merchant: `MERCHANT-${SECRET}`,
  confidence: 0.9,
  ...extra,
});

const ROWS: Row[] = [
  { id: 'r01', source: 'telegram', created: noon('2026-10-31'), parse: parse() },
  { id: 'r02', source: 'telegram', created: noon('2026-10-31'), updated: noon('2026-10-31', 60), category: 'cat-taxi', parse: parse() },
  { id: 'r03', source: 'manual', created: '2026-10-30 19:30:00' },
  { id: 'r04', source: 'telegram', created: '2026-10-31 20:30:00', updated: '2026-10-31 20:31:00', amountMinor: 2718281, parse: parse() },
  { id: 'r05', source: 'telegram', created: noon('2026-11-01'), updated: noon('2026-11-01', 5), account: 'acc-cash', parse: parse() },
  { id: 'r06', source: 'telegram', created: noon('2026-11-02'), parse: parse({ categoryId: undefined }) },
  { id: 'r07', source: 'ios_shortcut', created: noon('2026-11-02'), needsReview: true, parse: parse({ needsReview: true }) },
  { id: 'r08', source: 'ios_shortcut', created: noon('2026-11-03'), updated: noon('2026-11-03', 30), parse: parse({ needsReview: true }) },
  { id: 'r09', source: 'apple_pay', created: noon('2026-11-03'), needsReview: true, parse: parse() },
  { id: 'r10', source: 'apple_pay', created: noon('2026-11-03'), needsReview: true, currency: 'USD', amountMinor: 3141592, parse: parse() },
  { id: 'r11', source: 'apple_pay', created: noon('2026-11-03'), parse: parse() },
  { id: 'r12', source: 'telegram', created: noon('2026-11-04'), updated: noon('2026-11-04', 1), deleted: true, needsReview: true, parse: parse() },
  { id: 'r13', source: 'miniapp', created: noon('2026-11-05'), updated: noon('2026-11-05', 10), semanticType: 'transfer', parse: parse() },
  { id: 'r14', source: 'manual', created: noon('2026-11-05'), updated: noon('2026-11-05', 120) },
  { id: 'r15', source: 'manual', created: noon('2026-11-05') },
  // Deleted in the second it was written, as a large amount held until it is answered: updatedAt = createdAt
  { id: 'r16', source: 'telegram', created: noon('2026-11-05'), deleted: true, parse: parse() },
  { id: 'r17', source: 'telegram', created: noon('2026-11-05'), updated: noon('2026-11-05', 3), parse: parse() },
  { id: 'r18', source: null, created: noon('2026-11-05') },
  { id: 'r19', source: 'telegram', created: noon('2026-11-05') },
  // 23:59 on 30 October in Tashkent: before the period
  { id: 'r20', source: 'telegram', created: '2026-10-30 18:59:00', parse: parse() },
  { id: 'u2-r1', user: 'user-2', account: 'acc-u2', category: 'cat-u2', source: 'miniapp', created: noon('2026-11-05'), parse: parse({ categoryId: 'cat-u2' }) },
];

/** Bot messages: which records each shows, what the bot heard (a voice), «?» still shown, the last change. */
const BOT_MESSAGES = [
  { id: 'm1', records: ['r01'], heard: null, state: { selected: 0, guessed: [] } },
  { id: 'm2', records: ['r02'], heard: `УСЛЫШАЛ-${SECRET}`, state: { selected: 0, guessed: [], changed: 'Категория: Такси' } },
  { id: 'm3', records: ['r04'], heard: null, state: { selected: 0, guessed: [], changed: 'Сумма изменена: было 31 415,92' } },
  { id: 'm4', records: ['r05'], heard: null, state: { selected: 0, guessed: [], changed: `Счёт: СЧЁТ-${SECRET}` } },
  { id: 'm5', records: ['r06'], heard: `УСЛЫШАЛ-${SECRET}`, state: { selected: 0, guessed: ['r06'] } },
  { id: 'm6', records: ['r12'], heard: null, state: { selected: 0, guessed: [] } },
  { id: 'm7', records: ['r16', 'r17'], heard: null, state: { selected: 1, guessed: [], changed: 'Дата: вчера' } },
];

async function buildDatabase(file: string): Promise<void> {
  const ds = createAppDataSource(file);
  await ds.initialize();
  try {
    await ds.runMigrations();
    for (const [id, telegramId] of [['user-1', '111'], ['user-2', '222']]) {
      await ds.query(`INSERT INTO users (id, telegram_id, first_name) VALUES (?, ?, ?)`, [id, telegramId, `ИМЯ-${SECRET}`]);
    }
    const accounts = [['acc-card', 'user-1', 'UZS'], ['acc-cash', 'user-1', 'UZS'], ['acc-usd', 'user-1', 'USD'], ['acc-u2', 'user-2', 'UZS']];
    for (const [id, userId, currency] of accounts) {
      await ds.query(
        `INSERT INTO accounts (id, user_id, name, kind, currency, opening_date) VALUES (?, ?, ?, 'card', ?, '2026-10-01')`,
        [id, userId, `СЧЁТ-${SECRET}-${id}`, currency]
      );
    }
    await ds.query(`INSERT INTO user_settings (user_id, default_account_id) VALUES ('user-1', 'acc-card')`);
    const categories = [['cat-cafe', 'user-1', 'cafe'], ['cat-taxi', 'user-1', 'taxi'], ['cat-u2', 'user-2', 'cafe']];
    for (const [id, userId, preset] of categories) {
      await ds.query(
        `INSERT INTO categories (id, user_id, type, name, name_key, color, preset_key) VALUES (?, ?, 'expense', ?, ?, 'mint', ?)`,
        [id, userId, `КАТЕГОРИЯ-${SECRET}-${id}`, `key-${id}`, preset]
      );
    }
    for (const row of ROWS) {
      await ds.query(
        `INSERT INTO transactions (id, amount_minor, type, semanticType, needsReview, description, date, merchant,
           originalText, originalParsing, createdAt, updatedAt, userId, category_id, account_id, currency, source,
           deleted_at, search_text)
         VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
        [
          row.id, row.amountMinor ?? 3141592, row.semanticType ?? 'expense', row.needsReview ? 1 : 0,
          `ЗАМЕТКА-${SECRET}`, row.created.slice(0, 10), `MERCHANT-${SECRET}`, `ТЕКСТ-${SECRET}`,
          row.parse ? JSON.stringify(row.parse) : null, row.created, row.updated ?? row.created, row.user ?? 'user-1',
          row.category ?? 'cat-cafe', row.account ?? 'acc-card', row.currency ?? 'UZS', row.source,
          row.deleted ? row.updated ?? row.created : null,
        ]
      );
    }
    for (const [index, message] of BOT_MESSAGES.entries()) {
      await ds.query(
        `INSERT INTO bot_messages (id, user_id, chat_id, message_id, record_ids, mode, state, heard) VALUES (?, 'user-1', '111', ?, ?, 'confirm', ?, ?)`,
        [message.id, index + 1, JSON.stringify(message.records), JSON.stringify(message.state), message.heard]
      );
    }
  } finally {
    await ds.destroy();
  }
}

const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('capture quality report (FT-217)', () => {
  let dir: string;
  let copy: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft217-'));
    copy = path.join(dir, 'kapelka-report.sqlite');
    await buildDatabase(copy);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function run(args: string[], appRoot = dir): Promise<{ code: number; out: string; err: string }> {
    let out = '';
    let err = '';
    const code = await main(args, {
      out: text => { out += `${text}\n`; },
      err: text => { err += `${text}\n`; },
      now: NOW,
      appRoot,
    });
    return { code, out, err };
  }

  const period = ['--from=2026-10-31', '--to=2026-11-06'];

  describe('on all users', () => {
    let out: string;

    beforeAll(async () => {
      const result = await run([`--db=${copy}`, ...period]);
      expect(result.err).toBe('');
      expect(result.code).toBe(0);
      out = result.out;
    });

    it('prints the headline: records without a correction out of 10 and days in a row', () => {
      expect(out).toMatch(/Без правки: 5,5 из 10 — 11 из 20 записей/);
      expect(out).toMatch(/Дней подряд: 4 — самая длинная серия; сейчас: 1/);
    });

    it('counts records per Tashkent day; a day with only a deleted record is a day without records', () => {
      expect(out).toMatch(/Записано 20: осталось 18, удалено после записи 2/);
      expect(out).toMatch(/2026-10-31 сб\s+3\n/);
      expect(out).toMatch(/2026-11-01 вс\s+2\n/);
      expect(out).toMatch(/2026-11-04 ср\s+—\s+удалено 1/);
      expect(out).toMatch(/2026-11-05 чт\s+7\s+удалено 1/);
      expect(out).toMatch(/2026-11-06 пт\s+—\s+сегодня, день не закончен/);
      expect(out).toMatch(/Дней без записей: 1 — 2026-11-04/);
      expect(out).toMatch(/Пользователей с записями: 2/);
    });

    it('splits the sources: bot text and voice by the bot message, each with its corrections', () => {
      expect(out).toMatch(/бот · текст\s+6\s+30%\s+3\s+2\s+1 из 6/);
      expect(out).toMatch(/бот · голос\s+2\s+10%\s+1\s+0\s+1 из 2/);
      expect(out).toMatch(/бот · без сообщения\s+1\s+5%\s+0\s+0\s+1 из 1/);
      expect(out).toMatch(/iOS · голос или текст\s+2\s+10%\s+1\s+0\s+1 из 2/);
      expect(out).toMatch(/Apple Pay\s+3\s+15%\s+0\s+0\s+3 из 3/);
      expect(out).toMatch(/Mini App · фраза или голос\s+2\s+10%\s+1\s+0\s+1 из 2/);
      expect(out).toMatch(/вручную\s+3\s+15%\s+1\s+0\s+2 из 3/);
      expect(out).toMatch(/без источника\s+1\s+5%\s+0\s+0\s+1 из 1/);
      expect(out).toMatch(/всего\s+20\s+100%\s+7\s+2\s+11 из 20/);
    });

    it('says what was corrected and on what each number is based', () => {
      expect(out).toMatch(/правка \(по времени изменения\)»: 7 из 18 оставшихся/);
      expect(out).toMatch(/категория — по снимку разбора: 1 \(снимок категории есть у 12 из 18\)/);
      expect(out).toMatch(/сумма — по снимку разбора: 1 \(снимок суммы есть у 13 из 18\)/);
      expect(out).toMatch(/тип — по снимку разбора: 1\n/);
      expect(out).toMatch(/остальное — счёт, дата, заметка, пометка, «Вернуть»: 4/);
      expect(out).toMatch(/в боте последней правкой сообщения были счёт: 1, дата: 1/);
      expect(out).toMatch(/Удалены после записи: 2 — считаются правкой/);
      expect(out).toMatch(/Снимка разбора нет у 5 из 18/);
    });

    it('counts «Нужно проверить» and «?» at capture and how many were never touched', () => {
      expect(out).toMatch(/«Нужно проверить» при записи: 5 из 20 \(25%\) — так и не тронуты: 3, пометка стоит сейчас: 3, удалены: 1/);
      expect(out).toMatch(/«\?» у категории \(бот\): так и не сняли у 1 из 7 записей бота; из них запись не тронута: 1/);
    });

    it('finds Apple Pay payments that went to the default account without a matched card', () => {
      expect(out).toMatch(/Оплат: 3\. Без сопоставленной карты, на счёт по умолчанию: 2/);
      expect(out).toMatch(/из них валюта оплаты не совпала со счётом: 1/);
      expect(out).toMatch(/Оплат без пометки, но с правкой после записи: 0/);
    });

    it('prints no amount, note, merchant, text, name or heard words', () => {
      const body = out.split(copy).join('<db>');
      expect(body).not.toContain(SECRET);
      expect(body).not.toMatch(/Такси|вчера|31 415|31415|27182|3141592/);
      // No long number, no number grouped in thousands: the report has counts, shares and dates only
      expect(body).not.toMatch(/\d{5,}/);
      expect(body).not.toMatch(/\d[   ]\d{3}(?!\d)/);
    });
  });

  it('reads one user by Telegram id', async () => {
    const { code, out } = await run([`--db=${copy}`, ...period, '--user=111']);
    expect(code).toBe(0);
    expect(out).toMatch(/Без правки: 5,3 из 10 — 10 из 19 записей/);
    expect(out).toMatch(/Пользователей с записями: 1/);
    expect(out).toMatch(/Mini App · фраза или голос\s+1\s+5%\s+1\s+0\s+0 из 1/);
  });

  it('uses the two weeks from 31 October by default', async () => {
    const { code, out } = await run([`--db=${copy}`]);
    expect(code).toBe(0);
    expect(out).toMatch(/Период: 2026-10-31 — 2026-11-14/);
    expect(out).toMatch(/Дни после сегодняшнего \(2026-11-07 — 2026-11-14\) не считаются/);
  });

  it('leaves the database file as it was, and creates nothing beside it', async () => {
    const before = sha256(copy);
    const files = fs.readdirSync(dir).sort();
    await run([`--db=${copy}`, ...period]);
    expect(sha256(copy)).toBe(before);
    expect(fs.readdirSync(dir).sort()).toEqual(files);
  });

  it('refuses the live database and reads only a copy', async () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'ft217-app-'));
    try {
      const live = path.join(app, 'data', 'database.sqlite');
      fs.mkdirSync(path.dirname(live));
      fs.copyFileSync(copy, live);
      const before = sha256(live);
      const { code, out, err } = await run([`--db=${live}`, ...period], app);
      expect(code).toBe(1);
      expect(out).toBe('');
      expect(err).toMatch(/живая база/);
      expect(err).toMatch(/\.backup/);
      expect(sha256(live)).toBe(before);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  it('never creates a database that is not there', async () => {
    const missing = path.join(dir, 'ft217-missing.sqlite');
    const { code, err } = await run([`--db=${missing}`, ...period]);
    expect(code).toBe(1);
    expect(err).toMatch(/нет файла/);
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('explains wrong arguments', async () => {
    expect((await run([])).err).toMatch(/--db/);
    expect((await run([`--db=${copy}`, '--from=31.10.2026'])).err).toMatch(/--from/);
    expect((await run([`--db=${copy}`, '--from=2026-11-10', '--to=2026-11-01'])).err).toMatch(/раньше/);
    expect((await run([`--db=${copy}`, '--format=json'])).err).toMatch(/--format/);
    const help = await run(['--help']);
    expect(help.code).toBe(0);
    expect(help.out).toMatch(/--db=/);
  });
});
