import crypto from 'crypto';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import {
  aiRateLimiter,
  createStandardRateLimiter,
} from '../src/delivery/web/express/middleware/rateLimitMiddleware';
import { createSettingsRoutes } from '../src/modules/user/presentation/controllers/settingsController';
import { UserModule } from '../src/modules/user/userModule';
import { SqliteUserRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserRepository';
import { SqliteUserSettingsRepository } from '../src/modules/user/infrastructure/persistence/SqliteUserSettingsRepository';
import { openMigratedDatabase, TestDatabase } from './helpers/testDatabase';

/**
 * FT-139: the general API limit counts per Telegram user, not per address.
 * Signed in (initData, or X-Dev-User-Id outside production) — 600 requests per 15 minutes per user;
 * without sign-in — 100 per address, as before. The AI limit keeps counting per address.
 */

const BOT_TOKEN = 'test-bot-token-ft139';

type Headers = Record<string, string>;

interface App {
  /** Sends `count` GET requests (20 at a time) and returns their statuses in send order. */
  hit(count: number, headers?: Headers, path?: string): Promise<number[]>;
  /** One GET request with its status, body and RateLimit-Limit header. */
  one(headers?: Headers, path?: string): Promise<{ status: number; body: any; limit: string | null }>;
  close(): Promise<void>;
}

async function serve(app: express.Express): Promise<App> {
  const server = await new Promise<http.Server>(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = (headers: Headers, path: string) => fetch(`${baseUrl}${path}`, { headers });

  return {
    async hit(count, headers = {}, path = '/api/things') {
      const statuses: number[] = [];
      for (let sent = 0; sent < count; sent += 20) {
        const batch = Array.from({ length: Math.min(20, count - sent) }, () =>
          get(headers, path).then(async res => {
            await res.arrayBuffer();
            return res.status;
          })
        );
        statuses.push(...(await Promise.all(batch)));
      }
      return statuses;
    },
    async one(headers = {}, path = '/api/things') {
      const res = await get(headers, path);
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, limit: res.headers.get('ratelimit-limit') };
    },
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/** An app with one route behind a fresh general limiter, so every test starts from zero. */
function limitedApp(): Promise<App> {
  const app = express();
  app.use('/api/things', createStandardRateLimiter({ botToken: BOT_TOKEN }), (_req, res) => {
    res.json({ success: true });
  });
  return serve(app);
}

const devUser = (id: number): Headers => ({ 'X-Dev-User-Id': String(id) });

/** Telegram Mini App initData signed the way Telegram signs it (HMAC-SHA256 with the bot token). */
function initData(userId: number, botToken = BOT_TOKEN): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'AAH-test');
  params.set('user', JSON.stringify({ id: userId, first_name: 'Test' }));
  const dataCheckString = Array.from(params.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

const telegramUser = (id: number, botToken?: string): Headers => ({ Authorization: `tma ${initData(id, botToken)}` });

const count = (statuses: number[], status: number) => statuses.filter(s => s === status).length;

describe('general API rate limit per user (FT-139)', () => {
  let app: App;

  beforeEach(async () => {
    app = await limitedApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('without sign-in allows 100 requests per address and answers the 101st with 429', async () => {
    const first = await app.hit(100);
    expect(count(first, 200)).toBe(100);

    const over = await app.one();
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ success: false, code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('lets a signed-in user past 100 requests, up to 600, and answers the 601st with 429', async () => {
    const first = await app.hit(600, devUser(111));
    expect(count(first, 200)).toBe(600);

    const over = await app.one(devUser(111));
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('announces the limit that applies: 600 signed in, 100 without sign-in', async () => {
    expect((await app.one(devUser(222))).limit).toBe('600');
    expect((await app.one()).limit).toBe('100');
  });

  it('gives two users on one address separate counters', async () => {
    expect(count(await app.hit(600, devUser(301)), 200)).toBe(600);
    expect((await app.one(devUser(301))).status).toBe(429);

    expect((await app.one(devUser(302))).status).toBe(200);
    // Nor does a user's spent limit block visitors without sign-in on that address.
    expect((await app.one()).status).toBe(200);
  });

  it('does not stop signed-in users when the address has spent its anonymous limit', async () => {
    expect(count(await app.hit(100), 200)).toBe(100);
    expect((await app.one()).status).toBe(429);

    expect((await app.one(devUser(401))).status).toBe(200);
  });

  it('counts valid Telegram initData per user, with the signed-in limit', async () => {
    const first = await app.hit(101, telegramUser(501));
    expect(count(first, 200)).toBe(101);
    expect((await app.one(telegramUser(501))).limit).toBe('600');

    // The same person through initData and through the dev header is one counter.
    expect((await app.one(devUser(501))).limit).toBe('600');
  });

  it('counts initData that does not verify by address, like a request without sign-in', async () => {
    const forged = telegramUser(601, 'some-other-bot-token');
    expect(count(await app.hit(100, forged), 200)).toBe(100);

    const over = await app.one(forged);
    expect(over.status).toBe(429);
    expect(over.limit).toBe('100');
    // Another forged id does not get a fresh counter either.
    expect((await app.one(telegramUser(602, 'some-other-bot-token'))).status).toBe(429);
  });

  describe('in production', () => {
    const savedNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = savedNodeEnv;
    });

    it('ignores X-Dev-User-Id: such requests count by address', async () => {
      expect(count(await app.hit(100, devUser(701)), 200)).toBe(100);
      expect((await app.one(devUser(702))).status).toBe(429);
    });

    it('still counts valid initData per user', async () => {
      expect(count(await app.hit(101, telegramUser(703)), 200)).toBe(101);
    });
  });
});

describe('AI rate limit is unchanged (FT-139)', () => {
  let app: App;

  beforeEach(async () => {
    aiRateLimiter.resetKey('127.0.0.1');
    aiRateLimiter.resetKey('::ffff:127.0.0.1');
    const voiceApp = express();
    voiceApp.use('/api/voice', aiRateLimiter, (_req, res) => {
      res.json({ success: true });
    });
    app = await serve(voiceApp);
  });

  afterEach(async () => {
    await app.close();
  });

  it('still allows 20 AI requests per address, shared by everyone on it', async () => {
    expect(count(await app.hit(10, devUser(801), '/api/voice'), 200)).toBe(10);
    expect(count(await app.hit(10, devUser(802), '/api/voice'), 200)).toBe(10);

    const over = await app.one(devUser(803), '/api/voice');
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ code: 'AI_RATE_LIMIT_EXCEEDED' });
  });
});

describe('a real route behind the general limit (FT-139)', () => {
  let db: TestDatabase;
  let app: App;

  beforeAll(async () => {
    db = await openMigratedDatabase();
    const userModule = new UserModule(
      new SqliteUserRepository(db.dataSource),
      new SqliteUserSettingsRepository(db.dataSource)
    );
    const settingsApp = express();
    settingsApp.use(express.json());
    settingsApp.use('/api/settings', createSettingsRoutes(userModule));
    app = await serve(settingsApp);
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it('serves a signed-in user past 100 requests, and stops the 101st anonymous one', async () => {
    // The first request creates the user; parallel first contacts are not what this test is about.
    expect((await app.one(devUser(900100), '/api/settings')).status).toBe(200);
    const signedIn = await app.hit(119, devUser(900100), '/api/settings');
    expect(count(signedIn, 200)).toBe(119);

    // Without sign-in the route answers 401, and the 101st request is refused by the limit first.
    const anonymous = await app.hit(100, {}, '/api/settings');
    expect(count(anonymous, 401)).toBe(100);
    expect((await app.one({}, '/api/settings')).status).toBe(429);
  });
});
