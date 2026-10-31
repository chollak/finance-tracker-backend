import 'reflect-metadata';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import { createAppDataSource } from '../src/shared/infrastructure/database/database.config';
import { main } from '../scripts/capture-quality-report';

/**
 * The capture quality report (FT-217) on a real SQLite file built by the app's own migrations: every source, edits,
 * flags still waiting, a confirmation that only touched a record, records sent on a later day than their own, a day
 * with only a deleted record, Apple Pay without a matched card. The numbers it prints are asserted, and so is what it
 * must never do — write to the file or print an amount, a note or a text.
 */

const SECRET = 'СЕКРЕТ';
const NOW = new Date('2026-11-07T05:00:00Z'); // 10:00 on 7 November in Tashkent

interface Row {
  id: string;
  user?: string;
  source: string | null;
  /** createdAt as SQLite keeps it, UTC. */
  created: string;
  /** The day of the operation; the Tashkent day of `created` when absent. */
  date?: string;
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

const tashkentDayOf = (created: string) =>
  new Date(Date.parse(`${created.replace(' ', 'T')}Z`) + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

/*
 * By the day of the operation: 31.10 — 3, 1.11 — 4, 2.11 — none, 3.11 — 4, 4.11 — 1 (sent on 5.11) and one deleted,
 * 5.11 — 8 and one deleted, 6.11 — none, 7.11 — today. By the day sent: 4.11 has only the deleted record, 6.11 has the
 * Apple Pay payment of 5.11.
 */
const ROWS: Row[] = [
  { id: 'r01', source: 'telegram', created: noon('2026-10-31'), parse: parse() },
  { id: 'r02', source: 'telegram', created: noon('2026-10-31'), updated: noon('2026-10-31', 60), category: 'cat-taxi', parse: parse() },
  { id: 'r03', source: 'manual', created: '2026-10-30 19:30:00' },
  { id: 'r04', source: 'telegram', created: '2026-10-31 20:30:00', updated: '2026-10-31 20:31:00', amountMinor: 2718281, parse: parse() },
  { id: 'r05', source: 'telegram', created: noon('2026-11-01'), updated: noon('2026-11-01', 5), account: 'acc-cash', parse: parse() },
  { id: 'r06', source: 'telegram', created: noon('2026-11-01'), parse: parse({ categoryId: undefined }) },
  { id: 'r07', source: 'ios_shortcut', created: noon('2026-11-01'), needsReview: true, parse: parse({ needsReview: true }) },
  // The flag taken off in the Mini App: touched, nothing in the snapshot changed
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
  // iOS queue: the phrase of 4 November went out on the 5th
  { id: 'r21', source: 'ios_shortcut', created: noon('2026-11-05'), date: '2026-11-04', parse: parse() },
  // Apple Pay of 5 November sent on the 6th: in a period that ends on the 5th all the same
  { id: 'r22', source: 'apple_pay', created: '2026-11-06 03:00:00', date: '2026-11-05', parse: parse() },
  // «вчера» said on 31 October: the operation is before the period, the sending is in it
  { id: 'r23', source: 'telegram', created: noon('2026-10-31'), date: '2026-10-30', parse: parse() },
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
          `ЗАМЕТКА-${SECRET}`, row.date ?? tashkentDayOf(row.created), `MERCHANT-${SECRET}`, `ТЕКСТ-${SECRET}`,
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

  const period = ['--from=2026-10-31', '--to=2026-11-07'];

  describe('on all users', () => {
    let out: string;

    beforeAll(async () => {
      const result = await run([`--db=${copy}`, ...period]);
      expect(result.err).toBe('');
      expect(result.code).toBe(0);
      out = result.out;
    });

    it('gives the headline as a range over automatic capture only, without records still waiting', () => {
      expect(out).toMatch(/ИТОГ — автоматическая запись: бот, iOS, Apple Pay, Mini App \(фраза или голос\)/);
      expect(out).toMatch(/Без правки: 3,3–5,0 из 10 — 6–9 из 18 записей \(цель — 7 из 10\)/);
      expect(out).toMatch(/среди записей старше 2 дней: 1,8–3,6 из 10 — 2–4 из 11/);
      expect(out).toMatch(/Ждут проверки: 4 — стоит «Нужно проверить» или «\?»; в «без правки» не входят/);
      expect(out).toMatch(/Вручную \(в цель не входит\): 3 записи, без правки 2–3/);
      expect(out).toMatch(/Без источника и прочие \(в цель не входят\): 1 запись, без правки 1\n/);
    });

    it('counts days in a row by the day of the operation, and also by the day sent', () => {
      expect(out).toMatch(
        /Дней подряд: 3 по дню траты · 2 по дню отправки — самые длинные серии; сейчас: 0 · 2; сегодня записей пока нет \(цель — 14\)/
      );
      expect(out).toMatch(/По дню отправки \(createdAt\): самая длинная серия 2, сейчас 2; дней без отправки: 2 — 2026-11-02, 2026-11-04/);
      expect(out).toMatch(
        /Записей, отправленных не в свой день: 2 — опоздавшая отправка, поправленная дата, ручной ввод задним числом/
      );
    });

    it('counts records per day of the operation; a day with only a deleted record is a day without records', () => {
      expect(out).toMatch(/Записано 22: осталось 20, удалено после записи 2/);
      expect(out).toMatch(/2026-10-31 сб\s+3\n/);
      expect(out).toMatch(/2026-11-01 вс\s+4\n/);
      expect(out).toMatch(/2026-11-02 пн\s+—\n/);
      expect(out).toMatch(/2026-11-04 ср\s+1\s+удалено 1\n/);
      expect(out).toMatch(/2026-11-05 чт\s+8\s+удалено 1\n/);
      expect(out).toMatch(/2026-11-06 пт\s+—\n/);
      expect(out).toMatch(/2026-11-07 сб\s+—\s+сегодня, день не закончен/);
      expect(out).toMatch(/Дней без записей: 2 — 2026-11-02, 2026-11-06/);
      expect(out).toMatch(/Пользователей с записями: 2/);
    });

    it('says how fresh the copy is', () => {
      expect(out).toMatch(/Последняя запись в копии: 2026-11-06 08:00 по Ташкенту/);
    });

    it('splits the sources: bot text and voice by the bot message, each with its corrections', () => {
      expect(out).toMatch(/бот · текст\s+6\s+27%\s+3\s+2\s+0\s+1–3 из 6/);
      expect(out).toMatch(/бот · голос\s+2\s+9%\s+1\s+0\s+1\s+0 из 2/);
      expect(out).toMatch(/бот · без сообщения\s+1\s+5%\s+0\s+0\s+0\s+1 из 1/);
      expect(out).toMatch(/iOS · голос или текст\s+3\s+14%\s+1\s+0\s+1\s+1–2 из 3/);
      expect(out).toMatch(/Apple Pay\s+4\s+18%\s+0\s+0\s+2\s+2 из 4/);
      expect(out).toMatch(/Mini App · фраза или голос\s+2\s+9%\s+1\s+0\s+0\s+1 из 2/);
      expect(out).toMatch(/вручную\s+3\s+14%\s+1\s+0\s+0\s+2–3 из 3/);
      expect(out).toMatch(/без источника\s+1\s+5%\s+0\s+0\s+0\s+1 из 1/);
      expect(out).toMatch(/автоматически\s+18\s+82%\s+6\s+2\s+4\s+6–9 из 18/);
      expect(out).toMatch(/всего\s+22\s+100%\s+7\s+2\s+4\s+9–13 из 22/);
    });

    it('says what was corrected and on what each number is based', () => {
      expect(out).toMatch(/правка \(по времени изменения\)»: 7 из 20 оставшихся записей\n/);
      expect(out).toMatch(/категория — по снимку разбора: 1 \(снимок категории есть у 14 из 20\)/);
      expect(out).toMatch(/сумма — по снимку разбора: 1 \(снимок суммы есть у 15 из 20\)/);
      expect(out).toMatch(/тип — по снимку разбора: 1\n/);
      expect(out).toMatch(/остальное — счёт, дата, заметка, пометка, «Вернуть»: 4/);
      expect(out).toMatch(/в боте последней правкой сообщения были счёт: 1, дата: 1/);
      expect(out).toMatch(/Удалены после записи: 2 — считаются правкой/);
      expect(out).toMatch(/Снимка разбора нет у 5 из 20 оставшихся записей/);
    });

    it('counts «Нужно проверить» and «?» at capture and how many were never touched', () => {
      expect(out).toMatch(/«Нужно проверить» при записи: 5 из 22 \(23%\) — так и не тронуты: 3, пометка стоит сейчас: 3, удалены: 1/);
      expect(out).toMatch(/«\?» у категории \(бот\): так и не сняли у 1 из 7 записей бота; из них запись не тронута: 1/);
    });

    it('tells an unmatched card from a payment in another currency', () => {
      expect(out).toMatch(/Оплат: 4\. Без сопоставленной карты, на счёт по умолчанию: 1 \(пометка «Нужно проверить» стоит\)/);
      expect(out).toMatch(/Валюта оплаты не совпала со счётом: 1/);
      expect(out).toMatch(/Оплат без пометки, но с правкой после записи: 0/);
    });

    it('says what the report cannot see', () => {
      expect(out).toMatch(/ЧЕГО ОТЧЁТ НЕ ВИДИТ/);
      expect(out).toMatch(/без суммы — не записал/);
      expect(out).toMatch(/Дубли, которые не удалили/);
      expect(out).toMatch(/Свежие записи, которые ещё не успели поправить/);
    });

    it('prints no amount, note, merchant, text, name or heard words', () => {
      const body = out.split(copy).join('<db>');
      expect(body).not.toContain(SECRET);
      expect(body).not.toMatch(/Такси|вчера|31 415|31415|27182|3141592/);
      // No long number, no number grouped in thousands: the report has counts, shares, dates and times only
      expect(body).not.toMatch(/\d{5,}/);
      expect(body).not.toMatch(/\d[   ]\d{3}(?!\d)/);
    });
  });

  it('reads one user by Telegram id', async () => {
    const { code, out } = await run([`--db=${copy}`, ...period, '--user=111']);
    expect(code).toBe(0);
    expect(out).toMatch(/Без правки: 2,9–4,7 из 10 — 5–8 из 17 записей/);
    expect(out).toMatch(/Пользователей с записями: 1/);
    expect(out).toMatch(/Mini App · фраза или голос\s+1\s+5%\s+1\s+0\s+0\s+0 из 1/);
  });

  it('puts the word after a number in its form: из 1 записи, из 1 оставшейся записи', async () => {
    const { code, out } = await run([`--db=${copy}`, ...period, '--user=222']);
    expect(code).toBe(0);
    expect(out).toMatch(/Без правки: 10,0 из 10 — 1 из 1 записи \(цель/);
    expect(out).toMatch(/правка \(по времени изменения\)»: 0 из 1 оставшейся записи\n/);
    expect(out).toMatch(/так и не сняли у 0 из 0 записей бота/);
    expect(out).toMatch(/Вручную \(в цель не входит\): 0 записей/);
  });

  it('chooses the period by the day of the operation: a payment of the last day sent the next day is in', async () => {
    const { code, out } = await run([`--db=${copy}`, '--from=2026-10-31', '--to=2026-11-05']);
    expect(code).toBe(0);
    expect(out).toMatch(/Записано 22:/);
    expect(out).toMatch(/Apple Pay\s+4\s/);
    expect(out).toMatch(/Записей, отправленных не в свой день: 2/);
  });

  it('uses the two weeks from 31 October by default', async () => {
    const { code, out } = await run([`--db=${copy}`]);
    expect(code).toBe(0);
    expect(out).toMatch(/Период: 2026-10-31 — 2026-11-14/);
    expect(out).toMatch(/Дни после сегодняшнего \(2026-11-08 — 2026-11-14\) не считаются/);
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
      // The safe copy: no old copy counted silently, no empty database from a typo, stop on the first error
      expect(err).toContain('rm -f /tmp/kapelka-report.sqlite && test -s data/database.sqlite && sqlite3 -bail');
      expect(err).toMatch(/\.backup \/tmp\/kapelka-report\.sqlite/);
      expect(sha256(live)).toBe(before);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  describe('an empty copy — .backup failed', () => {
    const EMPTY = /Копия пустая — \.backup не удался, повтори копирование/;

    it('says so for a file of 0 bytes, and leaves it as it is', async () => {
      const empty = path.join(dir, 'ft217-empty.sqlite');
      fs.writeFileSync(empty, '');
      try {
        const files = fs.readdirSync(dir).sort();
        const { code, out, err } = await run([`--db=${empty}`, ...period]);
        expect(code).toBe(1);
        expect(out).toBe('');
        expect(err).toMatch(EMPTY);
        expect(err).toContain('rm -f /tmp/kapelka-report.sqlite');
        expect(err).not.toMatch(/старее схемы/);
        expect(fs.statSync(empty).size).toBe(0);
        expect(fs.readdirSync(dir).sort()).toEqual(files);
      } finally {
        fs.rmSync(empty, { force: true });
      }
    });

    it('says so for a database without a single table', async () => {
      const bare = path.join(dir, 'ft217-bare.sqlite');
      await new Promise<void>((resolve, reject) => {
        const db = new sqlite3.Database(bare, error => {
          if (error) return reject(error);
          db.exec('PRAGMA user_version = 1', execError => db.close(() => (execError ? reject(execError) : resolve())));
        });
      });
      try {
        expect(fs.statSync(bare).size).toBeGreaterThan(0);
        const before = sha256(bare);
        const { code, err } = await run([`--db=${bare}`, ...period]);
        expect(code).toBe(1);
        expect(err).toMatch(EMPTY);
        expect(err).not.toMatch(/старее схемы/);
        expect(sha256(bare)).toBe(before);
      } finally {
        fs.rmSync(bare, { force: true });
      }
    });
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
