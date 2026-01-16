import { Markup } from 'telegraf';
import { RU } from '../i18n/ru';
import { createWebAppUrl, isWebAppConfigured } from '../utils/webAppUrl';

/**
 * Creates main menu keyboard for /start command
 */
export function mainMenuKeyboard(userId: string) {
  if (!isWebAppConfigured()) {
    return undefined;
  }

  try {
    const url = createWebAppUrl(userId);
    return Markup.inlineKeyboard([
      [Markup.button.webApp(`📊 ${RU.welcome.openApp}`, url)],
    ]);
  } catch {
    return undefined;
  }
}

/**
 * Creates keyboard with "More stats" button for /stats command
 */
export function statsKeyboard(userId: string) {
  if (!isWebAppConfigured()) {
    return undefined;
  }

  try {
    const url = createWebAppUrl(userId, { path: 'analytics' });
    return Markup.inlineKeyboard([
      [Markup.button.webApp(`📊 ${RU.buttons.moreStats}`, url)],
    ]);
  } catch {
    return undefined;
  }
}

/**
 * Creates keyboard for /budget command
 */
export function budgetKeyboard(userId: string, hasBudgets: boolean) {
  if (!isWebAppConfigured()) {
    return undefined;
  }

  try {
    const url = createWebAppUrl(userId, { path: 'budgets' });
    const buttonText = hasBudgets ? RU.buttons.allBudgets : RU.buttons.createBudget;
    return Markup.inlineKeyboard([
      [Markup.button.webApp(`💰 ${buttonText}`, url)],
    ]);
  } catch {
    return undefined;
  }
}

/**
 * Creates keyboard for /settings command
 */
export function settingsKeyboard(userId: string) {
  if (!isWebAppConfigured()) {
    return undefined;
  }

  try {
    const url = createWebAppUrl(userId, { path: 'settings' });
    return Markup.inlineKeyboard([
      [Markup.button.webApp(`⚙️ ${RU.commands.settings.openSettings}`, url)],
    ]);
  } catch {
    return undefined;
  }
}

/**
 * Creates keyboard for /today command
 */
export function todayKeyboard(userId: string) {
  if (!isWebAppConfigured()) {
    return undefined;
  }

  try {
    const url = createWebAppUrl(userId, { path: 'transactions' });
    return Markup.inlineKeyboard([
      [Markup.button.webApp(`📊 ${RU.buttons.viewAll}`, url)],
    ]);
  } catch {
    return undefined;
  }
}
