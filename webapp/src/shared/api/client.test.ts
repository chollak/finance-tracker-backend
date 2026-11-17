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

type ApiClient = Awaited<ReturnType<typeof client>>['apiClient'];

const sentHeaders = () => (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;

describe('a 401 outside Telegram', () => {
  it('is a lost session: the handler is told', async () => {
    const { apiClient, onSessionLost } = await client();
    const lost = vi.fn();
    onSessionLost(lost);

    await expect(apiClient.get('/settings')).rejects.toMatchObject({ statusCode: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
  });

  // #271: the record's routes answer 401 without a session too (they answered 403 before), so a browser whose 30-day
  // session ended gets the login screen from a delete, an edit or «Отменить», not a failed toast
  it.each([
    ['a delete', (api: ApiClient) => api.delete('/transactions/tx-1?userId=597843119')],
    ['an edit', (api: ApiClient) => api.put('/transactions/tx-1', { categoryId: 'cat-1' })],
    ['«Отменить»', (api: ApiClient) => api.post('/transactions/tx-1/restore')],
    ['the record read', (api: ApiClient) => api.get('/transactions/tx-1')],
  ])('from %s of a record too: the handler is told', async (_case, send) => {
    const { apiClient, onSessionLost } = await client();
    const lost = vi.fn();
    onSessionLost(lost);

    await expect(send(apiClient)).rejects.toMatchObject({ statusCode: 401 });
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

  it('is not a refused Mini App either: there is no initData', async () => {
    const { apiClient, onMiniAppRefused } = await client();
    const refused = vi.fn();
    onMiniAppRefused(refused);

    await expect(apiClient.get('/settings')).rejects.toMatchObject({ statusCode: 401 });
    expect(refused).not.toHaveBeenCalled();
  });
});

/**
 * #316: Telegram gives the Mini App its initData once, when it is opened. The server takes it for 24 hours; a Mini App
 * left open or minimised longer gets 401 on every request, and so does initData the server refuses for any other
 * reason. Only opening the Mini App again brings new initData, so the app is told to say that.
 */
describe('a 401 inside Telegram', () => {
  const EXPIRED = { success: false, error: 'Telegram sign-in expired, open the Mini App again', code: 'INIT_DATA_EXPIRED' };

  beforeEach(() => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'query_id=1&hash=abc' } } });
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(EXPIRED), { status: 401 }));
  });

  it('is a refused Mini App: the handler is told, the request still fails with the code', async () => {
    const { apiClient, onMiniAppRefused } = await client();
    const refused = vi.fn();
    onMiniAppRefused(refused);

    await expect(apiClient.get('/transactions/totals')).rejects.toMatchObject({ statusCode: 401, code: 'INIT_DATA_EXPIRED' });
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a write', (api: ApiClient) => api.post('/transactions', { amountMinor: 1 })],
    ['an edit', (api: ApiClient) => api.put('/transactions/tx-1', { categoryId: 'cat-1' })],
    ['a delete', (api: ApiClient) => api.delete('/transactions/tx-1')],
    ['the CSV download', (api: ApiClient) => api.getFile('/export')],
  ])('from %s too', async (_case, send) => {
    const { apiClient, onMiniAppRefused } = await client();
    const refused = vi.fn();
    onMiniAppRefused(refused);

    await expect(send(apiClient)).rejects.toMatchObject({ statusCode: 401 });
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('a forged or unreadable initData (INVALID_AUTH) too: opening again is the only way', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false, code: 'INVALID_AUTH' }), { status: 401 }));
    const { apiClient, onMiniAppRefused } = await client();
    const refused = vi.fn();
    onMiniAppRefused(refused);

    await expect(apiClient.get('/accounts')).rejects.toMatchObject({ statusCode: 401 });
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('other refusals are not: 403 and 500 say nothing about initData', async () => {
    const { apiClient, onMiniAppRefused } = await client();
    const refused = vi.fn();
    onMiniAppRefused(refused);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: 'ACCESS_NOT_ALLOWED' }), { status: 403 }));
    await expect(apiClient.get('/accounts')).rejects.toMatchObject({ statusCode: 403 });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, code: 'INTERNAL_ERROR' }), { status: 500 }));
    await expect(apiClient.get('/accounts')).rejects.toMatchObject({ statusCode: 500 });

    expect(refused).not.toHaveBeenCalled();
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

describe('whether a write reached the server (FT-129)', () => {
  const json = { 'content-type': 'application/json; charset=utf-8' };

  async function lostThenAnswered(response: Response) {
    fetchMock.mockResolvedValueOnce(response);
    const { apiClient } = await client();
    const { useConnectivityStore } = await import('@/shared/lib/offline/connectivity');
    useConnectivityStore.setState({ browserOnline: true, lost: true });
    await apiClient.post('/transactions', { amountMinor: 1 }).catch(() => undefined);
    return useConnectivityStore.getState().lost;
  }

  it('an answer of the server ends «no connection»', async () => {
    expect(await lostThenAnswered(new Response(JSON.stringify({ success: true, data: { id: 't1' } }), { status: 201, headers: json }))).toBe(false);
  });

  it('so does its refusal: it was the server that answered', async () => {
    expect(await lostThenAnswered(new Response(JSON.stringify({ success: false }), { status: 400, headers: json }))).toBe(false);
  });

  it('so does its own error, which is JSON (an external service down, 502)', async () => {
    expect(await lostThenAnswered(new Response(JSON.stringify({ success: false, code: 'EXTERNAL_SERVICE_ERROR' }), { status: 502, headers: json }))).toBe(false);
  });

  it.each([502, 503, 504, 530])('a gateway answering %i while the server is down does not', async (status) => {
    expect(await lostThenAnswered(new Response('<html>Bad gateway</html>', { status, headers: { 'content-type': 'text/html' } }))).toBe(true);
  });

  it('the health check answered by the server returns the connection, even its 503 while the bot is down (FT-154)', async () => {
    const { serverAnswers } = await client();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'healthy' }), { status: 200, headers: json }));
    expect(await serverAnswers()).toBe(true);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'unhealthy', telegramBot: { state: 'failed' } }), { status: 503, headers: json }));
    expect(await serverAnswers()).toBe(true);
  });

  it('the health check answered by a gateway while the server is down does not', async () => {
    const { serverAnswers } = await client();

    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    expect(await serverAnswers()).toBe(false);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await serverAnswers()).toBe(false);
  });

  it('a read never does: only a write and the health check bring the connection back', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: json }));
    const { apiClient } = await client();
    const { useConnectivityStore } = await import('@/shared/lib/offline/connectivity');
    useConnectivityStore.setState({ browserOnline: true, lost: true });

    await apiClient.get('/accounts');

    expect(useConnectivityStore.getState().lost).toBe(true);
  });
});

/**
 * FT-146: a write may wait only so long (`timeoutMs`). Giving up is still «no answer» (`statusCode: 0`, so the outbox
 * keeps treating it as one), but it says it was the wait that ran out, not the network: the composer tells the two apart.
 */
describe('a write that waits too long', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is given up after timeoutMs as no answer that ran out of time', async () => {
    const { apiClient, REQUEST_TIMEOUT_CODE } = await client();

    const sent = apiClient.post('/quick-capture', { text: 'кофе 25к' }, { timeoutMs: 30_000 });
    const failed = expect(sent).rejects.toMatchObject({ statusCode: 0, code: REQUEST_TIMEOUT_CODE });
    await vi.advanceTimersByTimeAsync(30_000);

    await failed;
  });

  it('a network failure is not a timeout', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { apiClient } = await client();

    const error = await apiClient.post('/quick-capture', { text: 'кофе 25к' }, { timeoutMs: 30_000 }).catch((reason: unknown) => reason);

    expect(error).toEqual({ message: 'Network error', statusCode: 0 });
  });
});
