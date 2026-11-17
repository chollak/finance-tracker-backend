import { describe, expect, it } from 'vitest';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { Account, AccountsOverview } from '@/entities/account';
import type { PeriodTotals } from '@/entities/transaction';
import { balanceAmountClass, balanceCardModel, spendShare } from './balanceCard';

/**
 * FT-111, #367, board «Главная» (docs/pastel/components/BalanceCard.md): the default account large, the
 * total of the accounts exactly as GET /api/accounts gives it in a line under it, the accounts it is made
 * of, and one line — what share of the month's income is spent.
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
  it('shows the default account large, under its name', () => {
    const model = balanceCardModel(OVERVIEW, 'card');

    expect(model.title).toBe('Карта');
    expect(model.amount).toBe(`3${NBSP}180${NBSP}000`);
    expect(model.unit).toBe('сум');
    expect(balanceCardModel({ ...OVERVIEW, accounts: [account({ id: 'card', balanceMinor: -12_000_000 })] }, 'card').amount).toBe(
      `${MINUS}120${NBSP}000`
    );
  });

  it('falls back to the account the server writes a record to: the first visible one in сум', () => {
    // Not chosen, deleted, hidden, in dollars — the same rule as `defaultRecordAccount`
    for (const defaultAccountId of [null, 'gone', 'old', 'usd']) {
      expect(balanceCardModel(OVERVIEW, defaultAccountId)).toMatchObject({ title: 'Наличные', amount: `1${NBSP}250${NBSP}000`, unit: 'сум' });
    }
  });

  it('puts the total of GET /api/accounts as it is in the line «Всего на N счетах»', () => {
    const model = balanceCardModel(OVERVIEW, 'card');

    expect(model.total).toEqual({
      label: 'Всего на 3 счетах',
      value: `9${NBSP}743${NBSP}000`,
      spoken: `Всего на 3 счетах: 9${NBSP}743${NBSP}000${NBSP}сум`,
    });
    expect(balanceCardModel({ ...OVERVIEW, totalMinor: -12_000_000 }, 'card').total?.value).toBe(`${MINUS}120${NBSP}000`);
  });

  it('declines «на N счетах»', () => {
    const label = (count: number) =>
      balanceCardModel({ ...OVERVIEW, accounts: Array.from({ length: count }, (_, index) => account({ id: String(index) })) }, null).total
        ?.label;

    expect(label(2)).toBe('Всего на 2 счетах');
    expect(label(5)).toBe('Всего на 5 счетах');
    expect(label(21)).toBe('Всего на 21 счёте');
  });

  it('has no line of the total with one visible account: the card shows only it', () => {
    const one: AccountsOverview = {
      ...OVERVIEW,
      accounts: [OVERVIEW.accounts[1], OVERVIEW.accounts[3]],
      totalMinor: 318_000_000,
    };
    const model = balanceCardModel(one, null);

    expect(model).toMatchObject({ title: 'Карта', amount: `3${NBSP}180${NBSP}000`, unit: 'сум', total: null });
  });

  it('lists the visible accounts, each in its own currency; hidden ones are not counted', () => {
    expect(balanceCardModel(OVERVIEW, 'card').accounts).toEqual([
      { id: 'cash', name: 'Наличные', value: `1${NBSP}250${NBSP}000${NBSP}сум` },
      { id: 'card', name: 'Карта', value: `3${NBSP}180${NBSP}000${NBSP}сум` },
      { id: 'usd', name: 'Доллары', value: `420,00${NBSP}USD` },
    ]);
  });

  it('shows the first visible account in its own currency when none is in сум, the total named with its unit', () => {
    const dollars: AccountsOverview = {
      ...OVERVIEW,
      accounts: [
        account({ id: 'usd', name: 'Доллары', currency: 'USD', balanceMinor: 42_000 }),
        account({ id: 'usd2', name: 'Вклад', currency: 'USD', balanceMinor: 10_000 }),
      ],
      totalMinor: 657_800_000,
    };
    const model = balanceCardModel(dollars, null);

    expect(model).toMatchObject({ title: 'Доллары', amount: '420,00', unit: 'USD' });
    expect(model.total?.value).toBe(`6${NBSP}578${NBSP}000${NBSP}сум`);
  });

  it('shows the total alone when there is no visible account', () => {
    const model = balanceCardModel({ ...OVERVIEW, accounts: [OVERVIEW.accounts[3]], totalMinor: 0 }, 'old');

    expect(model).toMatchObject({ title: 'Всего на счетах', amount: '0', unit: 'сум', total: null, accounts: [] });
  });

  it('says by the total when dollars are left out of it for lack of a rate', () => {
    const noRate: AccountsOverview = { ...OVERVIEW, totalMinor: 443_000_000, rate: null, missingRate: true };

    expect(balanceCardModel(OVERVIEW, 'card').missingRateNote).toBeNull();
    expect(balanceCardModel(noRate, 'card').missingRateNote).toBe('Доллары не вошли в итог: курса пока нет');
    // One visible account: no total is shown, so there is nothing to explain
    expect(
      balanceCardModel({ ...noRate, accounts: [OVERVIEW.accounts[2]], totalMinor: 0 }, null)
    ).toMatchObject({ title: 'Доллары', amount: '420,00', unit: 'USD', total: null, missingRateNote: null });
  });

  it('makes a long amount smaller instead of wrapping it', () => {
    expect(balanceAmountClass(`9${NBSP}743${NBSP}000`)).toBe('type-balance');
    expect(balanceAmountClass(`974${NBSP}300${NBSP}000`)).toBe('type-balance');
    expect(balanceAmountClass(`${MINUS}974${NBSP}300${NBSP}000`)).toBe('type-balance-sm');
    expect(balanceAmountClass(`${MINUS}974${NBSP}300${NBSP}000${NBSP}000`)).not.toMatch(/type-balance/);
  });
});

describe('in dollars (FT-137, «Сум / USD»)', () => {
  const USD = { currency: 'USD' as const, rateMinor: 1_265_000 };

  it('shows the account at the rate in effect: 3 180 000 сум at 12 650 is 251,38 USD', () => {
    expect(balanceCardModel(OVERVIEW, 'card', USD)).toMatchObject({ title: 'Карта', amount: '251,38', unit: 'USD' });
  });

  it('shows the total in USD as before: the board’s 9 743 000 сум at 12 650 is 770,20 USD', () => {
    expect(balanceCardModel(OVERVIEW, 'card', USD).total).toEqual({
      label: 'Всего на 3 счетах',
      value: '770,20',
      spoken: `Всего на 3 счетах: 770,20${NBSP}USD`,
    });
  });

  it('keeps every account of the list in its own currency', () => {
    expect(balanceCardModel(OVERVIEW, 'card', USD).accounts).toEqual(balanceCardModel(OVERVIEW, 'card').accounts);
  });

  it('counts a dollar account as it is, without a round trip through сум', () => {
    // 420,00 USD at 12 850,37 is 5 397 155 сум after rounding; back at the same rate it must stay 420,00
    const dollarsOnly: AccountsOverview = {
      accounts: [
        account({ id: 'usd', name: 'Доллары', currency: 'USD', balanceMinor: 42_000 }),
        account({ id: 'usd2', name: 'Вклад', currency: 'USD', balanceMinor: 0 }),
      ],
      totalMinor: 539_715_500,
      rate: { rateMinor: 1_285_037, source: 'cbu', date: '2026-10-14' },
      missingRate: false,
    };

    expect(balanceCardModel(dollarsOnly, null, { currency: 'USD', rateMinor: 1_285_037 }).total?.value).toBe('420,00');
  });

  it('leaves the account and the total in сум when сум are shown', () => {
    const model = balanceCardModel(OVERVIEW, 'card', { currency: 'UZS', rateMinor: 1_265_000 });

    expect(model).toMatchObject({ amount: `3${NBSP}180${NBSP}000`, unit: 'сум' });
    expect(model.total?.value).toBe(`9${NBSP}743${NBSP}000`);
  });

  it('stays in сум without a rate', () => {
    const model = balanceCardModel(OVERVIEW, 'card', { currency: 'USD', rateMinor: null });

    expect(model).toMatchObject({ amount: `3${NBSP}180${NBSP}000`, unit: 'сум' });
    expect(model.total?.value).toBe(`9${NBSP}743${NBSP}000`);
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
