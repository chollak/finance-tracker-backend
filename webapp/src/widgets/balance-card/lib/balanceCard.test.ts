import { describe, expect, it } from 'vitest';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { Account, AccountsOverview } from '@/entities/account';
import type { PeriodTotals } from '@/entities/transaction';
import { balanceAmountClass, balanceCardModel, spendShare } from './balanceCard';

/**
 * FT-111, board «Главная» (docs/pastel/components/BalanceCard.md): the total of the accounts exactly as
 * GET /api/accounts gives it, the accounts it is made of, and one line — what share of the month's income
 * is spent.
 */

function account(overrides: Partial<Account>): Account {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Карта',
    kind: 'card',
    currency: 'UZS',
    openingBalanceMinor: 0,
    openingDate: '2026-10-14',
    isHidden: false,
    sortOrder: 10,
    balanceMinor: 0,
    ...overrides,
  };
}

// The board after the first launch: 1 250 000 + 3 180 000 сум + 420,00 USD at 12 650 сум = 9 743 000 сум
const OVERVIEW: AccountsOverview = {
  accounts: [
    account({ id: 'cash', name: 'Наличные', kind: 'cash', balanceMinor: 125_000_000, sortOrder: 10 }),
    account({ id: 'card', name: 'Карта', balanceMinor: 318_000_000, sortOrder: 20 }),
    account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', balanceMinor: 42_000, sortOrder: 30 }),
    account({ id: 'old', name: 'Старая карта', balanceMinor: 99_900_000, isHidden: true, sortOrder: 40 }),
  ],
  totalMinor: 974_300_000,
  rate: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' },
  missingRate: false,
};

function totals(incomeMinor: number, expenseMinor: number): PeriodTotals {
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    incomeMinor,
    expenseMinor,
    netMinor: incomeMinor - expenseMinor,
    recordCount: 0,
    needsReview: { count: 0, totalMinor: 0 },
    excludedMovementsMinor: 0,
    usd: { present: false, missingRate: false, rateMinor: null },
  };
}

describe('balance card', () => {
  it('shows the total of GET /api/accounts as it is, in сум', () => {
    const model = balanceCardModel(OVERVIEW);

    expect(model.total).toBe(`9${NBSP}743${NBSP}000`);
    expect(model.unit).toBe('сум');
    expect(balanceCardModel({ ...OVERVIEW, totalMinor: -12_000_000 }).total).toBe(`${MINUS}120${NBSP}000`);
  });

  it('counts and lists the visible accounts, each in its own currency; hidden ones are not in the total', () => {
    const model = balanceCardModel(OVERVIEW);

    expect(model.countLabel).toBe('3 счёта');
    expect(model.accounts).toEqual([
      { id: 'cash', name: 'Наличные', value: `1${NBSP}250${NBSP}000${NBSP}сум` },
      { id: 'card', name: 'Карта', value: `3${NBSP}180${NBSP}000${NBSP}сум` },
      { id: 'usd', name: 'Доллары', value: `420,00${NBSP}USD` },
    ]);
    expect(balanceCardModel({ ...OVERVIEW, accounts: [account({})] }).countLabel).toBe('1 счёт');
    expect(
      balanceCardModel({ ...OVERVIEW, accounts: Array.from({ length: 5 }, (_, index) => account({ id: String(index) })) }).countLabel
    ).toBe('5 счетов');
  });

  it('says when dollars are left out of the total for lack of a rate', () => {
    expect(balanceCardModel(OVERVIEW).missingRateNote).toBeNull();
    expect(balanceCardModel({ ...OVERVIEW, rate: null, missingRate: true }).missingRateNote).toBe(
      'Доллары не вошли в итог: курса пока нет'
    );
  });

  it('makes a long total smaller instead of wrapping it', () => {
    expect(balanceAmountClass(`9${NBSP}743${NBSP}000`)).toBe('type-balance');
    expect(balanceAmountClass(`974${NBSP}300${NBSP}000`)).toBe('type-balance');
    expect(balanceAmountClass(`${MINUS}974${NBSP}300${NBSP}000`)).toBe('type-balance-sm');
    expect(balanceAmountClass(`${MINUS}974${NBSP}300${NBSP}000${NBSP}000`)).not.toMatch(/type-balance/);
  });
});

describe('in dollars (FT-137, «Сум / USD»)', () => {
  const USD = { currency: 'USD' as const, rateMinor: 1_265_000 };

  it('shows the total in USD at the rate in effect: the board’s 9 743 000 сум at 12 650 is 770,20 USD', () => {
    const model = balanceCardModel(OVERVIEW, USD);

    expect(model.total).toBe('770,20');
    expect(model.unit).toBe('USD');
  });

  it('keeps every account in its own currency', () => {
    expect(balanceCardModel(OVERVIEW, USD).accounts).toEqual(balanceCardModel(OVERVIEW).accounts);
  });

  it('counts a dollar account as it is, without a round trip through сум', () => {
    // 420,00 USD at 12 850,37 is 5 397 155 сум after rounding; back at the same rate it must stay 420,00
    const dollarsOnly: AccountsOverview = {
      accounts: [account({ id: 'usd', name: 'Доллары', currency: 'USD', balanceMinor: 42_000 })],
      totalMinor: 539_715_500,
      rate: { rateMinor: 1_285_037, source: 'cbu', date: '2026-10-14' },
      missingRate: false,
    };

    expect(balanceCardModel(dollarsOnly, { currency: 'USD', rateMinor: 1_285_037 }).total).toBe('420,00');
  });

  it('leaves the total in сум as GET /api/accounts gives it when сум are shown', () => {
    const model = balanceCardModel(OVERVIEW, { currency: 'UZS', rateMinor: 1_265_000 });

    expect(model.total).toBe(`9${NBSP}743${NBSP}000`);
    expect(model.unit).toBe('сум');
  });

  it('stays in сум without a rate', () => {
    expect(balanceCardModel(OVERVIEW, { currency: 'USD', rateMinor: null })).toMatchObject({
      total: `9${NBSP}743${NBSP}000`,
      unit: 'сум',
    });
  });
});

describe('the line under the balance', () => {
  it('says what share of the month’s income is spent, the bar filled as much', () => {
    // Board: income 16 295 000, expenses 7 684 400 → 47%
    expect(spendShare(totals(1_629_500_000, 768_440_000), 10)).toEqual({
      kind: 'share',
      lead: 'В октябре потрачено',
      percent: '47%',
      tail: 'дохода',
      barPercent: 47,
    });
  });

  it('keeps the bar full when more than the income is spent', () => {
    expect(spendShare(totals(100_000_000, 130_000_000), 5)).toMatchObject({ lead: 'В мае потрачено', percent: '130%', barPercent: 100 });
  });

  it('explains the line while there is no income this month (after the first launch too)', () => {
    const hint = { kind: 'hint', text: 'Здесь появится, какую часть дохода вы потратили за месяц.' };
    expect(spendShare(totals(0, 0), 10)).toEqual(hint);
    expect(spendShare(totals(0, 5_000_000), 10)).toEqual(hint);
  });
});
