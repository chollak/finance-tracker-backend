import { apiClient, type ApiError } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants/routes';
import type { SessionUser } from '../model/store';

/**
 * Who this browser is signed in as (FT-128): `GET /api/auth/session` with the session cookie. Null when there is no
 * session (401); other failures (no network) are thrown — the caller keeps what it had.
 */
export async function readSession(): Promise<SessionUser | null> {
  try {
    const response = await apiClient.get<{ user: SessionUser }>(API_ENDPOINTS.AUTH.SESSION);
    return response.data?.user ?? null;
  } catch (error) {
    if ((error as ApiError).statusCode === 401) return null;
    throw error;
  }
}

/** «Выйти»: `DELETE /api/auth/session` ends the session in this browser only. */
export async function closeSession(): Promise<void> {
  await apiClient.delete(API_ENDPOINTS.AUTH.SESSION);
}
