import { env } from '@/shared/config/env';
import { connectionReached } from '@/shared/lib/offline/connectivity';
import type { ApiResponse, ApiError } from './types';
import { readServerError } from './readServerError';

/** How long a write may wait for the server before it counts as unanswered (FT-129): see `RequestOptions.timeoutMs`. */
export interface RequestOptions {
  /**
   * Give up after this many ms and reject as «no answer» (`statusCode: 0`). A record write uses it so a dead connection
   * that the browser still calls online ends in the outbox instead of a button that waits for a minute; its client id
   * (FT-106) makes the later send safe even if the server did get it.
   */
  timeoutMs?: number;
}

/**
 * `ApiError.code` of a request given up after `timeoutMs` (FT-146). Still «no answer» (`statusCode: 0`), but the wait ran
 * out rather than the network failing: the composer says «Не дождался ответа», not «Нет связи».
 */
export const REQUEST_TIMEOUT_CODE = 'REQUEST_TIMEOUT';

/**
 * Get Telegram Web App initData for authentication
 * Returns null if not running in Telegram or no initData available
 */
function getTelegramInitData(): string | null {
  if (typeof window === 'undefined') return null;

  const telegram = window.Telegram?.WebApp;
  if (!telegram?.initData) return null;

  return telegram.initData;
}

/**
 * Build authorization headers for API requests
 * Adds Telegram Mini App authentication if available
 * In development mode without Telegram, uses X-Dev-User-Id header (only with VITE_MOCK_USER_ID)
 * A browser sends neither: its session is an httpOnly cookie that goes with every same-origin request (FT-128)
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  const initData = getTelegramInitData();
  if (initData) {
    headers['Authorization'] = `tma ${initData}`;
  } else if (env.isDevelopment && env.mockUserId) {
    // Development mode: use mock user ID header
    headers['X-Dev-User-Id'] = env.mockUserId;
  }

  return headers;
}

/**
 * Whether an answer came from the app's server itself, so the connection to it is back (FT-129). Its errors are JSON
 * (`errorMiddleware`, its own 502 and 503 too); a gateway in front of it — the Cloudflare tunnel, a proxy — answers
 * 502, 503 or 504 (Cloudflare also 520–530) with a page of its own while the server is down, and that is still no
 * connection to it.
 */
function answeredByServer(response: Response): boolean {
  return response.status < 500 || (response.headers.get('content-type') ?? '').includes('application/json');
}

let sessionLost: (() => void) | null = null;

/**
 * What to do when the server stops taking the browser's session (FT-128): it ended, or «Выйти» was pressed in another
 * tab. Inside Telegram initData signs every request, so a 401 there is not a lost session.
 */
export function onSessionLost(handler: (() => void) | null): void {
  sessionLost = handler;
}

/** A 401 outside Telegram from a route other than the login's own. */
function noticeUnauthorized(endpoint: string, status: number): void {
  if (status !== 401 || getTelegramInitData() || endpoint.startsWith('/auth/')) return;
  sessionLost?.();
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = env.apiBaseUrl) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    { timeoutMs }: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const abort = timeoutMs ? new AbortController() : null;
    const timer = abort ? setTimeout(() => abort.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        ...options,
        ...(abort ? { signal: abort.signal } : {}),
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
          ...options.headers,
        },
      });
      // The server answered a write (FT-129). A read may come from the service worker's cache, so it does not count
      if (options.method && options.method !== 'GET' && answeredByServer(response)) connectionReached();

      if (!response.ok) {
        noticeUnauthorized(endpoint, response.status);
        const errorData = await response.json().catch(() => ({}));
        throw {
          message: errorData.message || 'Request failed',
          statusCode: response.status,
          errors: errorData.errors,
          ...readServerError(errorData),
        } as ApiError;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if ((error as ApiError).statusCode) {
        throw error;
      }

      if (abort?.signal.aborted) {
        throw { message: 'Request timed out', statusCode: 0, code: REQUEST_TIMEOUT_CODE } as ApiError;
      }

      throw {
        message: 'Network error',
        statusCode: 0,
      } as ApiError;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'GET',
    });
  }

  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(
      endpoint,
      {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      },
      options
    );
  }

  async put<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async patch<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  /**
   * A file the server sends as a download (FT-126: the CSV of all records): its bytes and the headers that name it.
   * Errors come as JSON, as from every other route.
   */
  async getFile(endpoint: string): Promise<{ blob: Blob; headers: Headers }> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });

      if (!response.ok) {
        noticeUnauthorized(endpoint, response.status);
        const errorData = await response.json().catch(() => ({}));
        throw {
          message: errorData.message || 'Request failed',
          statusCode: response.status,
          ...readServerError(errorData),
        } as ApiError;
      }

      return { blob: await response.blob(), headers: response.headers };
    } catch (error) {
      if ((error as ApiError).statusCode) {
        throw error;
      }

      throw {
        message: 'Network error',
        statusCode: 0,
      } as ApiError;
    }
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type for FormData - browser will set it with boundary
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        noticeUnauthorized(endpoint, response.status);
        const errorData = await response.json().catch(() => ({}));
        throw {
          message: errorData.message || 'Upload failed',
          statusCode: response.status,
          ...readServerError(errorData),
        } as ApiError;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if ((error as ApiError).statusCode) {
        throw error;
      }

      throw {
        message: 'Upload error',
        statusCode: 0,
      } as ApiError;
    }
  }
}

// Singleton instance
export const apiClient = new ApiClient();

/**
 * Whether the server answers at all (FT-129): `GET /api/health`, which the service worker never answers from its cache.
 * The offline mode asks it while the server is not answering, to know when it is back. Its own JSON 503 — the bot is
 * down (FT-154) — is still the server answering.
 */
export async function serverAnswers(timeoutMs = 10_000): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(`${env.apiBaseUrl}/health`, { signal: abort.signal, cache: 'no-store' });
    return answeredByServer(response);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
