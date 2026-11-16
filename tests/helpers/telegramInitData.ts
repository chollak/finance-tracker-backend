import crypto from 'crypto';

/**
 * Telegram Mini App initData for this user, signed the way Telegram signs it (HMAC-SHA256 with the bot token).
 * `ageSeconds` — how long ago Telegram gave it out (`auth_date`); now by default.
 */
export function signedInitData(userId: number, botToken: string, ageSeconds = 0): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000) - ageSeconds));
  params.set('user', JSON.stringify({ id: userId, first_name: 'Test' }));
  const dataCheckString = Array.from(params.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}
