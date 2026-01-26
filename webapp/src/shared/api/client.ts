import { env } from '@/shared/config/env';
import type { ApiResponse, ApiError } from './types';

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
 * In development mode without Telegram, uses X-Dev-User-Id header
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
        const errorData = await response.json().catch(() => ({}));
        throw {
          message: errorData.message || 'Request failed',
          statusCode: response.status,
          errors: errorData.errors,
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

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
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
        const errorData = await response.json().catch(() => ({}));
        throw {
          message: errorData.message || 'Upload failed',
          statusCode: response.status,
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
