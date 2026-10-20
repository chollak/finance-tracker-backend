import { env } from '@/shared/config/env';
import type { ApiResponse, ApiError } from './types';
import { readServerError } from './readServerError';

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
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
          ...options.headers,
        },
      });

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

      throw {
        message: 'Network error',
        statusCode: 0,
      } as ApiError;
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'GET',
    });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
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
