import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants/routes';
import type { SessionUser } from '@/entities/user';
import type { PendingLogin, WebLoginStatus } from '../model/webLogin';

/**
 * The web login's routes (FT-128, docs/pastel/api.md «Вход в браузере»). The browser's secrets are httpOnly cookies:
 * none of these sends or reads them.
 */

/** «Войти через Telegram»: a new one-time link to the bot. */
export async function startWebLogin(): Promise<PendingLogin> {
  const response = await apiClient.post<PendingLogin>(API_ENDPOINTS.AUTH.WEB_LOGIN);
  return response.data;
}

/** How this browser's login went. */
export async function readWebLogin(): Promise<WebLoginStatus> {
  const response = await apiClient.get<WebLoginStatus>(API_ENDPOINTS.AUTH.WEB_LOGIN);
  return response.data ?? { status: 'none' };
}

/** «Отменить вход». */
export async function cancelWebLogin(): Promise<void> {
  await apiClient.delete(API_ENDPOINTS.AUTH.WEB_LOGIN);
}

/** The confirmed login becomes this browser's session. */
export async function openWebSession(): Promise<SessionUser> {
  const response = await apiClient.post<{ user: SessionUser }>(API_ENDPOINTS.AUTH.SESSION);
  return response.data.user;
}
