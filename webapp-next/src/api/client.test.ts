/**
 * Сервер отвечает ошибкой в ДВУХ форматах, и клиент обязан понимать оба.
 *
 *   контроллеры  { success: false, error: { code, message, timestamp } }   error — объект
 *   middleware   { success: false, error: 'строка', code: 'INVALID_AUTH' }  error — строка
 *
 * Старый клиент читал `errorData.message` — поля с таким именем нет ни в одном
 * из форматов. Любая ошибка схлопывалась в «Request failed», а код терялся.
 * На телефоне это выглядит как «ничего не работает и непонятно почему».
 *
 * Код нужен по делу: на нём строится обработка протухшего initData (401) и
 * упёршегося лимита распознаваний (429) — оба встречаются регулярно.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, type ApiError } from './client';

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }))
  );
}

async function captureError(): Promise<ApiError> {
  try {
    await apiClient.get('/transactions/user/1');
    throw new Error('запрос обязан был упасть');
  } catch (error) {
    return error as ApiError;
  }
}

describe('разбор ошибки сервера', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { Telegram: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('понимает формат контроллеров, где error — объект', async () => {
    respondWith(400, {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Text is required', timestamp: '' },
    });

    const error = await captureError();

    expect(error.message).toBe('Text is required');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
  });

  it('понимает формат middleware, где error — строка', async () => {
    respondWith(401, {
      success: false,
      error: 'Invalid authentication',
      code: 'INVALID_AUTH',
    });

    const error = await captureError();

    expect(error.message).toBe('Invalid authentication');
    expect(error.code).toBe('INVALID_AUTH');
    expect(error.statusCode).toBe(401);
  });

  it('не теряет код лимита распознаваний', async () => {
    respondWith(429, {
      success: false,
      error: 'Too many AI requests, please try again later',
      code: 'AI_RATE_LIMIT_EXCEEDED',
    });

    const error = await captureError();

    expect(error.code).toBe('AI_RATE_LIMIT_EXCEEDED');
  });

  it('переживает ответ без тела, не выдавая undefined наружу', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('не JSON');
        },
      }))
    );

    const error = await captureError();

    expect(error.statusCode).toBe(502);
    expect(typeof error.message).toBe('string');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('сетевой отказ не выдаёт себя за ответ сервера', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const error = await captureError();

    expect(error.statusCode).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('успешный ответ возвращает data, а не конверт', async () => {
    respondWith(200, { success: true, data: [{ id: 'tx-1' }], timestamp: '' });

    const data = await apiClient.get<Array<{ id: string }>>('/transactions/user/1');

    expect(data).toEqual([{ id: 'tx-1' }]);
  });
});
