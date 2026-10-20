import { describe, expect, it } from 'vitest';
import type { Account, AccountsOverview } from '@/entities/account';
import type { UsdRates } from '@/entities/rate';
import { MINUS, NBSP } from '@/shared/lib/money';
import { accountsListModel } from './accountsList';
import { knownRates, rateRowModel, rateSheetModel } from './rateRow';

/**
 * FT-118, boards «Счета · итог, курс, список», «Скрытые счета», «Счета · нет связи» (AccountList.md, RateRow.md):
 * the total exactly as GET /api/accounts gives it with the rate named under it, «≈ … сум» under a dollar
 * account, «Скрытые счета · N», «Для перевода нужен второй счёт», and the rate row saying which rate is in effect.
 */

const TODAY = '2026-10-14';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'card',
    name: 'Карта',
    kind: 'card',
    currency: 'UZS',
    openingBalanceMinor: 0,
    openingDate: '2026-08-01',
    isHidden: false,
    sortOrder: 20,
    balanceMinor: 0,
    ...overrides,
  };
}

const CASH = account({ id: 'cash', name: 'Наличные', kind: 'cash', balanceMinor: 125_000_000, sortOrder: 10 });
const CARD = account({ id: 'card', name: 'Карта', balanceMinor: 318_000_000 });
const USD = account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', balanceMinor: 42_000, sortOrder: 30 });

// The board: 1 250 000 + 3 180 000 сум + 420,00 USD at 12 650 сум = 9 743 000 сум
const BOARD: AccountsOverview = {
  accounts: [CASH, CARD, USD],
  totalMinor: 974_300_000,
  rate: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' },
  missingRate: false,
};

describe('accounts list', () => {
  it('shows the total of GET /api/accounts and names the rate the dollars are counted at', () => {
    const model = accountsListModel(BOARD, TODAY);

    expect(model.total).toBe(`9${NBSP}743${NBSP}000`);
    expect(model.totalNote).toBe(`Доллары — по курсу ЦБ на 14 окт, 12${NBSP}650 сум`);
  });

  it('lists the visible accounts: type, currency, balance, and «≈ … сум» under a dollar account', () => {
    const model = accountsListModel(BOARD, TODAY);

    expect(model.rows.map((row) => [row.name, row.caption, row.icon, row.balance, row.inUzs])).toEqual([
      ['Наличные', 'сумы · наличные', 'cash', `1${NBSP}250${NBSP}000${NBSP}сум`, null],
      ['Карта', 'сумы · карта', 'card', `3${NBSP}180${NBSP}000${NBSP}сум`, null],
      ['Доллары', 'доллары · наличные', 'usd', `420,00${NBSP}USD`, `≈${NBSP}5${NBSP}313${NBSP}000${NBSP}сум`],
    ]);
    expect(model.rows[2].ariaLabel).toBe(`Доллары, 420,00${NBSP}USD, примерно 5${NBSP}313${NBSP}000${NBSP}сум. Открыть счёт`);
    expect(model.rows[0].ariaLabel).toBe(`Наличные, 1${NBSP}250${NBSP}000${NBSP}сум. Открыть счёт`);
  });

  it('keeps hidden accounts out of the list, counts them under «Скрытые счета · N» with their balances', () => {
    const model = accountsListModel(
      { ...BOARD, accounts: [CASH, CARD, { ...USD, isHidden: true }], totalMinor: 443_000_000, rate: null },
      TODAY
    );

    expect(model.rows.map((row) => row.name)).toEqual(['Наличные', 'Карта']);
    expect(model.hiddenLabel).toBe('Скрытые счета · 1');
    expect(model.hidden).toEqual([{ id: 'usd', name: 'Доллары', balance: `420,00${NBSP}USD`, ariaLabel: 'Показать счёт «Доллары»' }]);
    expect(model.totalNote).toBe('Все счета в сумах');
    expect(accountsListModel(BOARD, TODAY).hiddenLabel).toBeNull();
  });

  it('says the dollars are not in the total when there is no rate, and names an own rate as such', () => {
    expect(accountsListModel({ ...BOARD, totalMinor: 443_000_000, rate: null, missingRate: true }, TODAY).totalNote).toBe(
      'Доллары не вошли в итог: курса пока нет'
    );
    expect(accountsListModel({ ...BOARD, rate: { rateMinor: 1_280_000, source: 'own', date: TODAY } }, TODAY).totalNote).toBe(
      `Доллары — по своему курсу 12${NBSP}800 сум`
    );
    // No rate, no «≈»: nothing is made up
    expect(accountsListModel({ ...BOARD, rate: null, missingRate: true }, TODAY).rows[2].inUzs).toBeNull();
  });

  it('a negative balance keeps its minus', () => {
    const model = accountsListModel({ ...BOARD, accounts: [{ ...CARD, balanceMinor: -32_500_000 }, CASH] }, TODAY);
    expect(model.rows[0].balance).toBe(`${MINUS}325${NBSP}000${NBSP}сум`);
  });

  it('a transfer needs a second visible account, and the button says so', () => {
    expect(accountsListModel(BOARD, TODAY).transfer).toEqual({ available: true, label: 'Перевод или обмен' });
    const alone = accountsListModel({ ...BOARD, accounts: [CARD, { ...CASH, isHidden: true }], rate: null }, TODAY);
    expect(alone.transfer).toEqual({ available: false, label: 'Для перевода нужен второй счёт' });
  });
});

const RATES: UsdRates = {
  effective: { rateMinor: 1_265_000, source: 'cbu', date: '2026-10-14' },
  cbu: { rateMinor: 1_265_000, date: '2026-10-14', fetchedAt: '2026-10-14T04:00:00.000Z' },
  own: null,
};

describe('rate row', () => {
  it('names the rate in effect and its date: «ЦБ на 14 окт»', () => {
    expect(rateRowModel(RATES, { online: true, today: TODAY })).toEqual({
      title: `Курс доллара · 12${NBSP}650 сум`,
      caption: 'ЦБ на 14 окт',
      offline: false,
    });
  });

  it('an own rate says since when, and the Central Bank one beside it', () => {
    const own: UsdRates = {
      ...RATES,
      effective: { rateMinor: 1_280_000, source: 'own', date: '2026-10-14' },
      own: { rateMinor: 1_280_000, since: '2026-10-14' },
    };
    expect(rateRowModel(own, { online: true, today: TODAY })).toMatchObject({
      title: `Курс доллара · 12${NBSP}800 сум`,
      caption: `Свой с 14 окт · ЦБ 12${NBSP}650`,
    });
  });

  it('without a connection: the last known rate with its date, and the row says there is no connection', () => {
    const stale: UsdRates = { ...RATES, effective: { ...RATES.effective!, rateMinor: 1_264_000, date: '2026-10-13' }, cbu: { ...RATES.cbu!, rateMinor: 1_264_000, date: '2026-10-13' } };
    expect(rateRowModel(stale, { online: false, today: TODAY })).toEqual({
      title: `Курс доллара · 12${NBSP}640 сум`,
      caption: 'Нет связи · курс ЦБ на 13 окт',
      offline: true,
    });
  });

  it('before any rate is known it says so instead of a number', () => {
    expect(rateRowModel({ effective: null, cbu: null, own: null }, { online: true, today: TODAY })).toEqual({
      title: 'Курс доллара',
      caption: 'Курса пока нет: загрузится, когда ответит ЦБ',
      offline: false,
    });
  });

  it('until the rates are read — or when that fails — names the rate the total was counted at, never «нет курса»', () => {
    const counted = { rateMinor: 1_265_000, source: 'cbu' as const, date: '2026-10-14' };
    expect(rateRowModel(knownRates(undefined, counted), { online: true, today: TODAY })).toEqual({
      title: `Курс доллара · 12${NBSP}650 сум`,
      caption: 'ЦБ на 14 окт',
      offline: false,
    });
    expect(rateSheetModel(knownRates(undefined, counted), { online: true, today: TODAY })).toMatchObject({
      label: 'ЦБ Узбекистана · 14 окт',
      value: `12${NBSP}650`,
    });
    const own = knownRates(undefined, { rateMinor: 1_280_000, source: 'own', date: '2026-10-10' });
    expect(rateRowModel(own, { online: true, today: TODAY }).caption).toBe('Свой с 10 окт');
    // The rates once read win; with neither, the row says the rate is not there yet
    expect(knownRates(RATES, { ...counted, rateMinor: 1 })).toBe(RATES);
    expect(rateRowModel(knownRates(undefined, null), { online: true, today: TODAY }).caption).toBe('Курса пока нет: загрузится, когда ответит ЦБ');
  });

  it('the sheet shows the Central Bank rate, its date and how it is updated', () => {
    expect(rateSheetModel(RATES, { online: true, today: TODAY })).toEqual({
      label: 'ЦБ Узбекистана · 14 окт',
      value: `12${NBSP}650`,
      hint: 'Обновляется автоматически каждый день.',
      own: null,
    });
    expect(rateSheetModel(RATES, { online: false, today: TODAY })).toMatchObject({
      label: 'ЦБ · 14 окт · нет связи',
      hint: 'Покажу новый курс, как только появится связь.',
    });
    const own = rateSheetModel(
      { ...RATES, effective: { rateMinor: 1_280_000, source: 'own', date: TODAY }, own: { rateMinor: 1_280_000, since: TODAY } },
      { online: true, today: TODAY }
    );
    expect(own.own).toBe(`Сейчас действует свой курс: 12${NBSP}800 сум с 14 окт`);
  });
});
