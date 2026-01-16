import { AppConfig } from '../../../../shared/infrastructure/config/appConfig';

export interface WebAppUrlParams {
  edit?: string;
  path?: string;
  startapp?: string;
}

/**
 * Creates a URL for the Telegram Mini App
 * @param userId - Telegram user ID
 * @param params - Optional parameters for deep linking
 * @returns Full URL for Mini App
 */
export function createWebAppUrl(userId: string, params: WebAppUrlParams = {}): string {
  const baseUrl = AppConfig.getWebAppUrl();

  if (!baseUrl) {
    throw new Error('WEB_APP_URL not configured');
  }

  const webPath = params.path || '';
  const url = new URL(`/${webPath}`, baseUrl);

  // Always include userId
  url.searchParams.set('userId', userId);

  // Add edit parameter for transaction editing
  if (params.edit) {
    url.searchParams.set('edit', params.edit);
  }

  return url.toString();
}

/**
 * Creates a deep link URL for Telegram bot
 * Format: https://t.me/botname?startapp=command
 * @param botUsername - Bot username without @
 * @param startParam - Start parameter for deep linking
 */
export function createDeepLink(botUsername: string, startParam: string): string {
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`;
}

/**
 * Parse deep link start parameter
 * Format: action_id (e.g., edit_123, add, budgets)
 */
export function parseStartParam(startParam: string): { action: string; id?: string } {
  const [action, id] = startParam.split('_');
  return { action, id };
}

/**
 * Check if Web App URL is configured
 */
export function isWebAppConfigured(): boolean {
  try {
    const url = AppConfig.getWebAppUrl();
    return !!url;
  } catch {
    return false;
  }
}
