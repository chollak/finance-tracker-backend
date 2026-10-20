import { visibleAccounts, type AccountsOverview } from '@/entities/account';
import { pickableCategories, type Category } from '@/entities/category';
import type { UsdRates } from '@/entities/rate';
import { AUDIT_TIMES, DAILY_SUMMARY_TIMES, type SettingsPatch, type UserSettings } from '@/entities/settings';
import { formatMinor } from '@/shared/lib/money';
import { pluralWithCount } from '@/shared/lib/plural';

/**
 * «Ещё» (FT-125, boards «„Ещё“ — разделы и настройки», «Сводка дня в боте», «„Ещё“ в браузере»; SettingsList.md,
 * Switch.md): a list of sections, not a settings screen with «Сохранить». Every row says its state in plain words,
 * with numbers and times; a change applies at once and shows in the row.
 */

/** «3 счёта · курс ЦБ 12 650»: the visible accounts and the rate in effect. Nothing while the accounts are read. */
export function accountsState(overview: AccountsOverview | undefined, rates: UsdRates | undefined): string | undefined {
  if (!overview) return undefined;
  const count = pluralWithCount(visibleAccounts(overview.accounts).length, 'счёт', 'счёта', 'счетов');
  // Until the rates are read, the rate the total was counted at
  const rate = rates ? rates.effective : overview.rate;
  if (!rate) return `${count} · курса пока нет`;
  const value = formatMinor(rate.rateMinor, 'UZS', { unit: false });
  return `${count} · ${rate.source === 'own' ? 'свой курс' : 'курс ЦБ'} ${value}`;
}

/** «8 для расходов, 8 для доходов»: the categories a record can get; hidden ones stay out. */
export function categoriesState(categories: readonly Category[] | undefined): string | undefined {
  if (!categories) return undefined;
  return `${pickableCategories(categories, 'expense').length} для расходов, ${pickableCategories(categories, 'income').length} для доходов`;
}

/**
 * The bot's notices, as many as the bot really sends (design-system «Навигация, настройки и связь»): the summary
 * now (FT-124), the audit call and the goal alerts once there is an audit — until then they say «Скоро».
 */
export type NotificationKind = 'summary' | 'audit' | 'goals';

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['summary', 'audit', 'goals'];

type NotificationSettings = Pick<UserSettings, 'dailySummaryEnabled' | 'dailySummaryTime' | 'auditEnabled' | 'auditTime' | 'goalAlertsEnabled'>;

interface NotificationSpec {
  /** The row and the sheet. */
  title: string;
  /** What the bot sends and when, at the top of the sheet. */
  text: string;
  /** An action, not a state (Switch.md). */
  switchLabel: string;
  enabledField: 'dailySummaryEnabled' | 'auditEnabled' | 'goalAlertsEnabled';
  /** The time choice under the switch, while it is on. */
  time?: { field: 'dailySummaryTime' | 'auditTime'; label: string; options: readonly string[] };
  /** One line under the card. */
  note?: string;
  /** The row's state, as the board has it. */
  state: (on: boolean, time: string | null) => string;
  /**
   * The bot does not send this yet: the audit and the goals come with FT-132, their reminders with FT-133, which
   * drops this. The setting is kept already; while it is on the row says «Скоро» in place of the board's state, and
   * the sheet says when it starts.
   */
  soon?: { state: (time: string | null) => string; note: string };
}

export const NOTIFICATIONS: Record<NotificationKind, NotificationSpec> = {
  summary: {
    title: 'Сводка дня',
    text: 'Вечером бот пришлёт, сколько потрачено за день и на что, — одним сообщением с кнопкой «Открыть Daftar».',
    switchLabel: 'Присылать сводку',
    enabledField: 'dailySummaryEnabled',
    time: { field: 'dailySummaryTime', label: 'Во сколько присылать', options: DAILY_SUMMARY_TIMES },
    note: 'В день без записей сводка спросит, правда ли трат не было, — отдельного напоминания нет.',
    state: (on, time) => (on ? `Каждый вечер в ${time}` : 'Выключена'),
  },
  audit: {
    title: 'Звать на ревизию',
    text: 'Раз в месяц бот позовёт разобрать траты прошлого месяца: что было нужно, а что лишнее.',
    switchLabel: 'Звать 1-го числа',
    enabledField: 'auditEnabled',
    time: { field: 'auditTime', label: 'Во сколько звать', options: AUDIT_TIMES },
    state: (on, time) => (on ? `1-го числа в ${time}, за прошлый месяц` : 'Выключено'),
    soon: { state: (time) => `Скоро: 1-го числа в ${time}`, note: 'Ревизия появится скоро — тогда бот и начнёт звать.' },
  },
  goals: {
    title: 'Цели и подписки',
    text: 'Днём, если трата по цели из ревизии подходит к лимиту, и за день до списания подписки, которую вы решили отменить.',
    switchLabel: 'Предупреждать',
    enabledField: 'goalAlertsEnabled',
    state: (on) => (on ? 'Когда цель близка к лимиту и перед списанием подписки' : 'Выключено'),
    soon: {
      state: () => 'Скоро: когда цель близка к лимиту и перед списанием подписки',
      note: 'Цели и подписки появятся с ревизией — тогда бот и начнёт предупреждать.',
    },
  },
};

export interface NotificationState {
  on: boolean;
  /** HH:MM; null for a notice without a time. */
  time: string | null;
  /** The row's state: «Каждый вечер в 21:00», «Выключена». */
  state: string;
}

export function notificationState(kind: NotificationKind, settings: NotificationSettings): NotificationState {
  const spec = NOTIFICATIONS[kind];
  const on = settings[spec.enabledField];
  const time = spec.time ? settings[spec.time.field] : null;
  return { on, time, state: on && spec.soon ? spec.soon.state(time) : spec.state(on, time) };
}

/** One change of a notice is one setting: its switch or its time. */
export function notificationPatch(kind: NotificationKind, change: { on: boolean } | { time: string }): SettingsPatch {
  const spec = NOTIFICATIONS[kind];
  const patch: SettingsPatch = {};
  if ('on' in change) patch[spec.enabledField] = change.on;
  else if (spec.time) patch[spec.time.field] = change.time;
  return patch;
}

export const NOTIFICATION_SAVE_FAILED = { title: 'Не получилось сохранить настройку', detail: 'Проверьте связь и попробуйте ещё раз' } as const;

/** The bot's notices need the account: a guest has none. */
export const GUEST_NOTIFICATION_STATE = 'После входа через Telegram';

export const BOT_NOTE = 'Время — по Ташкенту. Кроме этого бот пишет только в ответ на ваши записи.';

/** The audit comes with its screens (FT-132); until then the row only says what it will be. */
export const AUDIT_SOON = 'Скоро: разбор трат прошлого месяца';

export const DATA_NOTE = 'Все записи с категориями, счетами и курсом — таблицей CSV, её откроет Excel или Google Таблицы.';

/** «Аккаунт» by a direct link: who is signed in (FT-128 brings «Выйти» with the web session). */
export function accountState(user: { isGuest: boolean; name: string | null }): { title: string; subtitle: string } {
  if (user.isGuest) return { title: 'Гость', subtitle: 'Записи только в этом браузере' };
  return { title: user.name || 'Аккаунт Telegram', subtitle: 'Вход через Telegram' };
}

export const VERSION_LINE = 'Daftar · версия 0.1';
