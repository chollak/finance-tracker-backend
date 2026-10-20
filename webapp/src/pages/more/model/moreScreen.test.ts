import { describe, expect, it } from 'vitest';
import type { Account, AccountsOverview } from '@/entities/account';
import type { UsdRates } from '@/entities/rate';
import type { UserSettings } from '@/entities/settings';
import { NBSP } from '@/shared/lib/money';
import { accountsState, NOTIFICATIONS, notificationPatch, notificationState } from './moreScreen';

/**
 * FT-125, board «„Ещё“ — разделы и настройки»: a row of «Ещё» says its state in plain words, with numbers and times
 * (SettingsList.md); «Выключено» without apologies.
 */

const account = (id: string, isHidden = false): Account => ({
  id, name: id, kind: 'cash', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-08-01', isHidden, sortOrder: 10, balanceMinor: 0,
});
const overview = (count: number, rate: AccountsOverview['rate'] = null): AccountsOverview => ({
  accounts: Array.from({ length: count }, (_, index) => account(`a${index}`)).concat(account('hidden', true)),
  totalMinor: 0,
  rate,
  missingRate: false,
});
const cbu = (rateMinor: number): UsdRates => ({
  effective: { rateMinor, source: 'cbu', date: '2026-10-14' },
  cbu: { rateMinor, date: '2026-10-14', fetchedAt: '' },
  own: null,
});

describe('«Счета и курс доллара»', () => {
  it('counts the visible accounts and names the rate in effect', () => {
    expect(accountsState(overview(3), cbu(1_265_000))).toBe(`3 счёта · курс ЦБ 12${NBSP}650`);
    expect(accountsState(overview(1), cbu(1_265_000))).toBe(`1 счёт · курс ЦБ 12${NBSP}650`);
    expect(accountsState(overview(5), cbu(1_265_000))).toBe(`5 счетов · курс ЦБ 12${NBSP}650`);
  });

  it('until the rates are read, the rate the total was counted at; without any rate it says so', () => {
    expect(accountsState(overview(3, { rateMinor: 1_270_000, source: 'own', date: '2026-10-15' }), undefined)).toBe(`3 счёта · свой курс 12${NBSP}700`);
    expect(accountsState(overview(3), { effective: null, cbu: null, own: null })).toBe('3 счёта · курса пока нет');
  });

  it('says nothing while the accounts are read', () => {
    expect(accountsState(undefined, cbu(1_265_000))).toBeUndefined();
  });
});

describe('the bot\'s notices', () => {
  const settings = (patch: Partial<UserSettings>) => ({ dailySummaryEnabled: true, dailySummaryTime: '21:00', auditEnabled: true, auditTime: '10:00', goalAlertsEnabled: true, ...patch });

  it('the summary: every evening at its time, or off', () => {
    expect(notificationState('summary', settings({ dailySummaryTime: '23:00' }))).toEqual({ on: true, time: '23:00', state: 'Каждый вечер в 23:00' });
    expect(notificationState('summary', settings({ dailySummaryEnabled: false })).state).toBe('Выключена');
  });

  it('the audit: on the 1st at its time, about the month before; or off', () => {
    expect(notificationState('audit', settings({ auditTime: '09:00' })).state).toBe('1-го числа в 09:00, за прошлый месяц');
    expect(notificationState('audit', settings({ auditEnabled: false })).state).toBe('Выключено');
  });

  it('goals and subscriptions: when, in words; or off', () => {
    expect(notificationState('goals', settings({}))).toEqual({ on: true, time: null, state: 'Когда цель близка к лимиту и перед списанием подписки' });
    expect(notificationState('goals', settings({ goalAlertsEnabled: false })).state).toBe('Выключено');
  });

  it('a change is one setting', () => {
    expect(notificationPatch('summary', { on: false })).toEqual({ dailySummaryEnabled: false });
    expect(notificationPatch('summary', { time: '20:00' })).toEqual({ dailySummaryTime: '20:00' });
    expect(notificationPatch('audit', { on: true })).toEqual({ auditEnabled: true });
    expect(notificationPatch('audit', { time: '12:00' })).toEqual({ auditTime: '12:00' });
    expect(notificationPatch('goals', { on: false })).toEqual({ goalAlertsEnabled: false });
  });

  it('the times are the ones the server accepts', () => {
    expect(NOTIFICATIONS.summary.time?.options).toEqual(['20:00', '21:00', '22:00', '23:00']);
    expect(NOTIFICATIONS.audit.time?.options).toEqual(['09:00', '10:00', '12:00', '19:00']);
    expect(NOTIFICATIONS.goals.time).toBeUndefined();
  });
});
