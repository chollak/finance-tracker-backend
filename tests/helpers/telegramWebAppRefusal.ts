import { TelegramError } from 'telegraf';

interface SentExtra {
  reply_markup?: { inline_keyboard?: Array<Array<{ web_app?: { url: string } }>> };
}

/**
 * Telegram as it answers a keyboard with a Mini App button off HTTPS: it refuses the whole message, not the one button
 * (#278). A fake chat calls this before it keeps what the bot sent or edited.
 */
export function refuseWebAppOffHttps(extra?: SentExtra): void {
  const buttons = extra?.reply_markup?.inline_keyboard?.flat() ?? [];
  const offHttps = buttons.find(button => button.web_app && !button.web_app.url.startsWith('https://'));
  if (!offHttps?.web_app) return;
  throw new TelegramError({
    error_code: 400,
    description: `Bad Request: inline keyboard button Web App URL '${offHttps.web_app.url}' is invalid: Only HTTPS links are allowed`,
  });
}
