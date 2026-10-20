import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FT-128: a browser signs in by a session cookie that goes with every request by itself, so the client adds no
 * headers there; inside Telegram it sends initData. When the server stops taking the session (it ended, or «Выйти» in
 * another tab) the app learns it from any 401 outside Telegram and shows the login screen. The dev header goes only
 * with an explicit VITE_MOCK_USER_ID.
 */

const env = { apiBaseUrl: '/api', isDevelopment: true, isProduction: false, mockUserId: null as string | null, mockUserName: 'Dev' };
vi.mock('@/shared/config/env', () => ({ env }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  env.mockUserId = null;
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'MISSING_AUTH_HEADER' } }), { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { Telegram: undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function client() {
  return import('./client');
}

const sentHeaders = () => (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;

describe('a 401 outside Telegram', () => {
  it('is a lost session: the handler is told', async () => {
    const { apiClient, onSessionLost } = await client();
    const lost = vi.fn();
    onSessionLost(lost);

    await expect(apiClient.get('/settings')).rejects.toMatchObject({ statusCode: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('from the login routes themselves is not: they answer about the login', async () => {
    const { apiClient, onSessionLost } = await client();
    const lost = vi.fn();
    onSessionLost(lost);

    await expect(apiClient.get('/auth/session')).rejects.toMatchObject({ statusCode: 401 });
    expect(lost).not.toHaveBeenCalled();
  });

  it('inside Telegram is not either: initData signs every request', async () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'query_id=1&hash=abc' } } });
    const { apiClient, onSessionLost } = await client();
    const lost = vi.fn();
    onSessionLost(lost);

    await expect(apiClient.get('/settings')).rejects.toMatchObject({ statusCode: 401 });
    expect(lost).not.toHaveBeenCalled();
    expect(sentHeaders().Authorization).toBe('tma query_id=1&hash=abc');
  });
});

describe('headers in a browser', () => {
  it('none: the session cookie goes by itself', async () => {
    const { apiClient } = await client();
    await apiClient.get('/settings').catch(() => undefined);

    expect(sentHeaders().Authorization).toBeUndefined();
    expect(sentHeaders()['X-Dev-User-Id']).toBeUndefined();
  });

  it('the dev user only when VITE_MOCK_USER_ID names one', async () => {
    env.mockUserId = '900000001';
    const { apiClient } = await client();
    await apiClient.get('/settings').catch(() => undefined);

    expect(sentHeaders()['X-Dev-User-Id']).toBe('900000001');
  });
});
