import { describe, expect, it } from 'vitest';
import type { Account, AccountsOverview } from '@/entities/account';
import type { UsdRates } from '@/entities/rate';
import { AUDIT_TIMES, DAILY_SUMMARY_TIMES, type UserSettings } from '@/entities/settings';
import { applyCandidateChange, type Audit } from '@/entities/audit';
import { BOARD_DONE, BOARD_OPEN, BOARD_PROGRESS, EARLY } from '@/entities/audit/model/fixtures';
import { NBSP } from '@/shared/lib/money';
import { accountsState, auditState, NOTIFICATIONS, notificationPatch, notificationState } from './moreScreen';

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

  // The bot sends them since FT-133: the row says the board's schedule
  it('the audit: on the 1st at its time, for the month before; or off', () => {
    expect(notificationState('audit', settings({ auditTime: '09:00' }))).toEqual({ on: true, time: '09:00', state: '1-го числа в 09:00, за прошлый месяц' });
    expect(notificationState('audit', settings({ auditEnabled: false })).state).toBe('Выключено');
  });

  it('goals and subscriptions: when, in words; or off', () => {
    expect(notificationState('goals', settings({}))).toEqual({ on: true, time: null, state: 'Когда цель близка к лимиту и перед списанием подписки' });
    expect(notificationState('goals', settings({ goalAlertsEnabled: false })).state).toBe('Выключено');
  });

  it('only the summary has a note under its card, as on the board', () => {
    expect(NOTIFICATIONS.summary.note).toBe('В день без записей сводка спросит, правда ли трат не было, — отдельного напоминания нет.');
    expect(NOTIFICATIONS.audit.note).toBeUndefined();
    expect(NOTIFICATIONS.goals.note).toBeUndefined();
  });

  it('a change is one setting', () => {
    expect(notificationPatch('summary', { on: false })).toEqual({ dailySummaryEnabled: false });
    expect(notificationPatch('summary', { time: '20:00' })).toEqual({ dailySummaryTime: '20:00' });
    expect(notificationPatch('audit', { on: true })).toEqual({ auditEnabled: true });
    expect(notificationPatch('audit', { time: '12:00' })).toEqual({ auditTime: '12:00' });
    expect(notificationPatch('goals', { on: false })).toEqual({ goalAlertsEnabled: false });
  });

  // That these are the server's own lists is checked by Jest (tests/notificationSettings.test.ts)
  it('the sheets offer the times of the settings', () => {
    expect(NOTIFICATIONS.summary.time?.options).toEqual(DAILY_SUMMARY_TIMES);
    expect(NOTIFICATIONS.audit.time?.options).toEqual(AUDIT_TIMES);
    expect(NOTIFICATIONS.goals.time).toBeUndefined();
  });
});

describe('«Ревизия трат» (FT-132)', () => {
  it('says the month and how many spendings wait, as the board: «Сентябрь · 6 трат на проверку»', () => {
    expect(auditState(BOARD_OPEN)).toBe('Сентябрь · 6 трат на проверку');
    expect(auditState(BOARD_PROGRESS)).toBe('Сентябрь · 4 траты на проверку');
    const allMarked = BOARD_OPEN.candidates.reduce((audit, entry) => applyCandidateChange(audit, entry.id, { decision: 'need' }), BOARD_OPEN);
    expect(auditState(allMarked)).toBe('Сентябрь · осталось нажать «Готово»');
  });

  it('after «Готово»: done, with the goals', () => {
    expect(auditState(BOARD_DONE)).toBe('Сентябрь · готово, 4 цели');
    expect(auditState({ ...BOARD_DONE, goals: [] })).toBe('Сентябрь · готово');
  });

  it('nothing found, too early, not read yet', () => {
    const nothing: Audit = { ...BOARD_OPEN, candidates: [], summary: { ...BOARD_OPEN.summary, count: 0, left: 0 } };
    expect(auditState(nothing)).toBe('Сентябрь · лишнего не нашлось');
    expect(auditState(EARLY)).toBe('Первая — 1 декабря');
    expect(auditState({ ...EARLY, firstRecordDate: null, firstAuditOn: null })).toBe('Нужен месяц записей');
    expect(auditState(undefined)).toBeUndefined();
  });
});
