import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import {
  allowGuestMode,
  verifyOwnership,
  writeAsSignedInUser,
  requireAuth,
} from '../src/delivery/web/express/middleware/authMiddleware';
import { verifyResourceOwnership } from '../src/shared/infrastructure/utils/ownershipVerification';
import { UserModule } from '../src/modules/user/userModule';

/**
 * The user a request reads or writes is the one it signed in as (2026-10-21). There are no guests (decision Д4), so a
 * `guest_*` id opens nothing; a userId in the path, query or body must be the signed-in user's own Telegram id — a UUID
 * proves nothing about who sent it; and a write takes the signed-in user, refusing a body that names someone else.
 */

const ME = '131184740';
const SOMEONE = '597843119';
const SOMEONES_UUID = '7f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

let server: http.Server;
let baseUrl: string;

/** What the userResolution middleware leaves for a UUID: the owner's Telegram id is not known. */
function resolvedAsUuid(req: Request, _res: Response, next: NextFunction) {
  if (req.params.userId === SOMEONES_UUID) req.resolvedUser = { id: SOMEONES_UUID, telegramId: null, isGuest: false };
  next();
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.get('/guest/:userId', allowGuestMode, (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/own/:userId', requireAuth, resolvedAsUuid, verifyOwnership, (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/write', requireAuth, writeAsSignedInUser, (req, res) => {
    res.json({ userId: req.body.userId });
  });
  app.post('/write-anyone', writeAsSignedInUser, (req, res) => {
    res.json({ userId: req.body.userId });
  });
  server = await new Promise<http.Server>(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

async function call(method: string, path: string, devUser?: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(devUser ? { 'X-Dev-User-Id': devUser } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('a guest id', () => {
  it('opens nothing without signing in', async () => {
    const res = await call('GET', '/guest/guest_abc123');
    expect(res.status).toBe(401);
  });

  it('is not anyone’s own id, so a signed-in user cannot use it either', async () => {
    expect((await call('GET', '/own/guest_abc123', ME)).status).toBe(403);
  });
});

describe('a userId in the path', () => {
  it('may be the signed-in user’s own Telegram id', async () => {
    expect((await call('GET', `/own/${ME}`, ME)).status).toBe(200);
  });

  it('may not be someone else’s Telegram id', async () => {
    expect((await call('GET', `/own/${SOMEONE}`, ME)).status).toBe(403);
  });

  it('may not be a UUID, which says nothing about who sent the request', async () => {
    expect((await call('GET', `/own/${SOMEONES_UUID}`, ME)).status).toBe(403);
  });
});

describe('a write', () => {
  it('is for the signed-in user when the body names nobody', async () => {
    expect((await call('POST', '/write', ME, { text: 'кофе 25к' })).body).toEqual({ userId: ME });
  });

  it('is for the signed-in user when the body names them — the Mini App’s outbox still sends it', async () => {
    expect((await call('POST', '/write', ME, { userId: ME })).body).toEqual({ userId: ME });
    expect((await call('POST', '/write', ME, { userId: Number(ME) })).body).toEqual({ userId: ME });
  });

  it('is refused when the body names someone else', async () => {
    const res = await call('POST', '/write', ME, { userId: SOMEONE });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCESS_DENIED');
  });

  it('is refused when the query names someone else — user resolution reads the query before the body', async () => {
    expect((await call('POST', `/write?userId=${SOMEONE}`, ME, { text: 'кофе 25к' })).status).toBe(403);
    expect((await call('POST', `/write?userId=${SOMEONE}&userId=${ME}`, ME, { text: 'кофе 25к' })).status).toBe(403);
    expect((await call('POST', `/write?userId=${ME}`, ME, { text: 'кофе 25к' })).body).toEqual({ userId: ME });
  });

  it('needs a signed-in user', async () => {
    expect((await call('POST', '/write-anyone', undefined, { userId: SOMEONE })).status).toBe(401);
  });
});

describe('a record owned by a guest id', () => {
  it('is not open to everyone', async () => {
    const userModule = {} as UserModule;
    const req = { telegramUser: undefined } as unknown as Request;
    await expect(
      verifyResourceOwnership(req, { userId: 'guest_abc123' }, userModule, { resourceType: 'transaction' })
    ).rejects.toThrow('Authentication required');
  });
});
