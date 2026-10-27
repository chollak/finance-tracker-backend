import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import {
  allowShortcutCapture,
  isLocalRequest,
  optionalAuth,
  requireAuth,
  signedInTelegramId,
} from '../src/delivery/web/express/middleware/authMiddleware';

/**
 * The dev headers sign in without any proof: `X-Dev-User-Id` as any user, `X-Shortcut-User-Id` as the owner of a
 * capture. Outside production the app runs on the owner's machine — but `npm run dev:miniapp` puts it on the internet
 * through a Cloudflare quick tunnel, and the server listens on every interface. So the headers count only for a
 * request from this machine: not one Cloudflare forwarded (`Cf-Connecting-Ip`, `X-Forwarded-For`), not one from the
 * network. A Shortcut through the tunnel needs SHORTCUT_CAPTURE_TOKEN.
 */

const TUNNEL = { 'Cf-Connecting-Ip': '203.0.113.7', 'X-Forwarded-For': '203.0.113.7' };

let server: http.Server;
let baseUrl: string;
const savedToken = process.env.SHORTCUT_CAPTURE_TOKEN;
const savedOwner = process.env.SHORTCUT_CAPTURE_OWNER;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.get('/required', requireAuth, (req, res) => {
    res.json({ id: req.telegramUser?.id ?? null });
  });
  app.get('/optional', optionalAuth, (req, res) => {
    res.json({ id: req.telegramUser?.id ?? null });
  });
  app.get('/signed', (req, res) => {
    res.json({ id: signedInTelegramId(req, 'bot-token') });
  });
  app.post('/capture', allowShortcutCapture, (req, res) => {
    res.json({ userId: req.body.userId, source: req.body.source });
  });
  server = await new Promise<http.Server>(resolve => {
    const listening = app.listen(0, () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.SHORTCUT_CAPTURE_TOKEN;
  else process.env.SHORTCUT_CAPTURE_TOKEN = savedToken;
  if (savedOwner === undefined) delete process.env.SHORTCUT_CAPTURE_OWNER;
  else process.env.SHORTCUT_CAPTURE_OWNER = savedOwner;
});

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('X-Dev-User-Id', () => {
  it('signs in a request from this machine, as before', async () => {
    const dev = { 'X-Dev-User-Id': '131184740' };
    expect((await call('GET', '/required', dev)).body).toEqual({ id: 131184740 });
    expect((await call('GET', '/optional', dev)).body).toEqual({ id: 131184740 });
    expect((await call('GET', '/signed', dev)).body).toEqual({ id: 131184740 });
  });

  it('is ignored for a request that came through the tunnel', async () => {
    const dev = { 'X-Dev-User-Id': '131184740', ...TUNNEL };
    const required = await call('GET', '/required', dev);
    expect(required.status).toBe(401);
    expect(required.body.code).toBe('MISSING_AUTH_HEADER');
    expect((await call('GET', '/optional', dev)).body).toEqual({ id: null });
    expect((await call('GET', '/signed', dev)).body).toEqual({ id: null });
  });

  it('is ignored behind any proxy that says who it forwards for', async () => {
    const res = await call('GET', '/required', { 'X-Dev-User-Id': '131184740', 'X-Forwarded-For': '192.168.1.20' });
    expect(res.status).toBe(401);
  });
});

describe('a request from this machine', () => {
  const request = (remoteAddress: string | undefined, headers: Record<string, string> = {}) =>
    ({ headers: { host: 'localhost:3000', ...headers }, socket: { remoteAddress } }) as unknown as express.Request;

  it('comes over loopback, IPv4 or IPv6, with no forwarding headers', () => {
    expect(isLocalRequest(request('127.0.0.1'))).toBe(true);
    expect(isLocalRequest(request('::1'))).toBe(true);
    expect(isLocalRequest(request('::ffff:127.0.0.1'))).toBe(true);
  });

  it('is not one from the network or one without an address', () => {
    expect(isLocalRequest(request('192.168.1.20'))).toBe(false);
    expect(isLocalRequest(request('::ffff:10.0.0.5'))).toBe(false);
    expect(isLocalRequest(request(undefined))).toBe(false);
  });

  it('is not one Cloudflare forwarded, though cloudflared itself connects over loopback', () => {
    expect(isLocalRequest(request('127.0.0.1', { 'cf-connecting-ip': '203.0.113.7' }))).toBe(false);
    expect(isLocalRequest(request('127.0.0.1', { 'x-forwarded-for': '203.0.113.7' }))).toBe(false);
    expect(isLocalRequest(request('127.0.0.1', { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '127.0.0.1' }))).toBe(false);
    expect(isLocalRequest(request('127.0.0.1', { forwarded: 'for=203.0.113.7' }))).toBe(false);
  });

  it('may come through the Vite proxy for a browser on this machine, which says it forwards for loopback', () => {
    expect(isLocalRequest(request('127.0.0.1', { 'x-forwarded-for': '127.0.0.1' }))).toBe(true);
    expect(isLocalRequest(request('::1', { 'x-forwarded-for': '::1' }))).toBe(true);
  });

  it('is not one the Vite proxy forwards for another device (vite --host)', () => {
    expect(isLocalRequest(request('127.0.0.1', { 'x-forwarded-for': '192.168.1.20' }))).toBe(false);
    expect(isLocalRequest(request('127.0.0.1', { 'x-forwarded-for': '127.0.0.1, 192.168.1.20' }))).toBe(false);
  });

  it('is addressed to this machine by name — not a page of another site rebound to 127.0.0.1', () => {
    expect(isLocalRequest(request('127.0.0.1', { host: '127.0.0.1:3000' }))).toBe(true);
    expect(isLocalRequest(request('::1', { host: '[::1]:3000' }))).toBe(true);
    expect(isLocalRequest(request('127.0.0.1', { host: 'evil.example:3000' }))).toBe(false);
    expect(isLocalRequest(request('127.0.0.1', { host: 'localhost.evil.example' }))).toBe(false);
    expect(isLocalRequest(({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }) as unknown as express.Request)).toBe(false);
  });
});

describe('X-Shortcut-User-Id (FT-075)', () => {
  it('captures for the header owner from this machine without a token, as before', async () => {
    delete process.env.SHORTCUT_CAPTURE_TOKEN;
    const res = await call('POST', '/capture', { 'X-Shortcut-User-Id': '131184740' }, { text: 'такси 18к', userId: '1' });
    expect(res.body).toEqual({ userId: '131184740', source: 'ios_shortcut' });
  });

  it('through the tunnel without SHORTCUT_CAPTURE_TOKEN is refused: anyone with the link could write as anyone', async () => {
    delete process.env.SHORTCUT_CAPTURE_TOKEN;
    const res = await call('POST', '/capture', { 'X-Shortcut-User-Id': '131184740', ...TUNNEL }, { text: 'такси 18к' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHORTCUT_CAPTURE_TOKEN_REQUIRED');
  });

  it('through the tunnel with the token captures as before', async () => {
    process.env.SHORTCUT_CAPTURE_TOKEN = 'test-token-value';
    const res = await call(
      'POST',
      '/capture',
      { 'X-Shortcut-User-Id': '131184740', 'X-Shortcut-Capture-Token': 'test-token-value', ...TUNNEL },
      { text: 'такси 18к' }
    );
    expect(res.body).toEqual({ userId: '131184740', source: 'ios_shortcut' });
  });

  it('with SHORTCUT_CAPTURE_OWNER the header may only repeat the owner, from this machine too (FT-155)', async () => {
    process.env.SHORTCUT_CAPTURE_OWNER = '131184740';
    const other = await call('POST', '/capture', { 'X-Shortcut-User-Id': '597843119' }, { text: 'такси 18к' });
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('ACCESS_DENIED');

    const same = await call('POST', '/capture', { 'X-Shortcut-User-Id': '0131184740' }, { text: 'такси 18к' });
    expect(same.body).toEqual({ userId: '131184740', source: 'ios_shortcut' });
  });

  it('with SHORTCUT_CAPTURE_OWNER the token alone writes for the owner through the tunnel (FT-155)', async () => {
    process.env.SHORTCUT_CAPTURE_TOKEN = 'test-token-value';
    process.env.SHORTCUT_CAPTURE_OWNER = '131184740';
    const res = await call('POST', '/capture', { 'X-Shortcut-Capture-Token': 'test-token-value', ...TUNNEL }, { text: 'такси 18к' });
    expect(res.body).toEqual({ userId: '131184740', source: 'ios_shortcut' });
  });

  it('without an owner a request with only the token has nobody to write for (FT-155)', async () => {
    process.env.SHORTCUT_CAPTURE_TOKEN = 'test-token-value';
    const res = await call('POST', '/capture', { 'X-Shortcut-Capture-Token': 'test-token-value' }, { text: 'такси 18к' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHORTCUT_OWNER_REQUIRED');
  });
});
