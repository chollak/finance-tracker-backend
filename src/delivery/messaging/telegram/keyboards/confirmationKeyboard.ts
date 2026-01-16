import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { RU } from '../i18n/ru';
import { createWebAppUrl, isWebAppConfigured } from '../utils/webAppUrl';

type InlineButton = InlineKeyboardButton.CallbackButton | InlineKeyboardButton.WebAppButton;

/**
 * Creates keyboard for transaction that needs confirmation
 * Shows: Confirm, Edit, Delete, View All
 */
export function transactionConfirmationKeyboard(transactionId: string, userId: string) {
  const buttons: InlineButton[][] = [
    [
      Markup.button.callback(`✅ ${RU.buttons.confirm}`, `confirm:${transactionId}`),
      Markup.button.callback(`✏️ ${RU.buttons.edit}`, `edit:${transactionId}`),
    ],
    [Markup.button.callback(`❌ ${RU.buttons.delete}`, `delete:${transactionId}`)],
  ];

  // Add Web App button if configured
  if (isWebAppConfigured()) {
    try {
      const url = createWebAppUrl(userId);
      buttons.push([Markup.button.webApp(`📊 ${RU.buttons.viewAll}`, url)]);
    } catch {
      // Skip web app button if URL creation fails
    }
  }

  return Markup.inlineKeyboard(buttons);
}

/**
 * Creates keyboard for auto-saved transaction
 * Shows: Edit, Delete, Open App
 */
export function transactionAutoSavedKeyboard(transactionId: string, userId: string) {
  const buttons: InlineButton[][] = [
    [
      Markup.button.callback(`✏️ ${RU.buttons.edit}`, `edit:${transactionId}`),
      Markup.button.callback(`🗑️ ${RU.buttons.delete}`, `delete:${transactionId}`),
    ],
  ];

  // Add Web App button if configured
  if (isWebAppConfigured()) {
    try {
      const url = createWebAppUrl(userId);
      buttons.push([Markup.button.webApp(`📊 ${RU.buttons.openApp}`, url)]);
    } catch {
      // Skip web app button if URL creation fails
    }
  }

  return Markup.inlineKeyboard(buttons);
}

/**
 * Creates keyboard after transaction is confirmed
 * Shows: Edit, Delete
 */
export function transactionConfirmedKeyboard(transactionId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`✏️ ${RU.buttons.edit}`, `edit:${transactionId}`),
      Markup.button.callback(`🗑️ ${RU.buttons.delete}`, `delete:${transactionId}`),
    ],
  ]);
}

/**
 * Creates keyboard for editing transaction
 * Opens Web App with edit parameter
 */
export function transactionEditKeyboard(transactionId: string, userId: string) {
  if (!isWebAppConfigured()) {
    return Markup.inlineKeyboard([
      [Markup.button.callback(`${RU.buttons.back}`, 'back')],
    ]);
  }

  try {
    const url = createWebAppUrl(userId, { edit: transactionId });
    return Markup.inlineKeyboard([
      [Markup.button.webApp(`✏️ ${RU.buttons.edit}`, url)],
    ]);
  } catch {
    return Markup.inlineKeyboard([
      [Markup.button.callback(`${RU.buttons.back}`, 'back')],
    ]);
  }
}
