import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { offlineRecords, parseOfflineText } from './offlineText';

/**
 * FT-129, OfflineBar.md and the board «Главная без связи»: without a connection a simple «what and how much» is read on
 * the device, the way the bot reads it — «такси 18к, кофе 25к» is two records, «55$» goes to the dollar account, «45»
 * without «к» is 45 000 with «проверьте сумму». The category is guessed from the first word by the starter categories;
 * anything else goes to «Другое».
 */

const category = (id: string, type: 'expense' | 'income', name: string, presetKey: string | null, isOther = false): Category => ({
  id, type, name, color: 'rose', isHidden: false, isOther, sortOrder: 1, presetKey,
});

const CATEGORIES: Category[] = [
  category('c-gro', 'expense', 'Продукты', 'groceries'),
  category('c-cafe', 'expense', 'Кафе', 'cafe'),
  category('c-tr', 'expense', 'Такси и метро', 'transport'),
  category('c-health', 'expense', 'Здоровье', 'health'),
  category('c-tel', 'expense', 'Связь', 'telecom'),
  category('c-other', 'expense', 'Другое', 'other', true),
  category('c-sal', 'income', 'Зарплата', 'salary'),
  category('c-oinc', 'income', 'Другое', 'other-income', true),
];

const account = (id: string, name: string, currency: 'UZS' | 'USD', isHidden = false): Account => ({
  id, name, kind: 'cash', currency, openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden, sortOrder: 1, balanceMinor: 0,
});

const ACCOUNTS = [account('cash', 'Наличные', 'UZS'), account('card', 'Карта', 'UZS'), account('usd', 'Доллары', 'USD')];
const CONTEXT = { categories: CATEGORIES, accounts: ACCOUNTS, defaultAccountId: 'card', today: '2026-10-14' };

const records = (text: string, context = CONTEXT) => {
  const items = parseOfflineText(text);
  if (!items) throw new Error(`«${text}» was not read`);
  return offlineRecords(items, context);
};

describe('reading a phrase on the device', () => {
  it('«такси 18к, кофе 25к» is two records', () => {
    expect(parseOfflineText('такси 18к, кофе 25к')).toEqual([
      { type: 'expense', amountMinor: 1_800_000, currency: 'UZS', note: 'Такси', presetKey: 'transport', checkAmount: false },
      { type: 'expense', amountMinor: 2_500_000, currency: 'UZS', note: 'Кофе', presetKey: 'cafe', checkAmount: false },
    ]);
  });

  it('«55$» is dollars', () => {
    expect(parseOfflineText('55$')).toEqual([
      { type: 'expense', amountMinor: 5_500, currency: 'USD', note: '', presetKey: null, checkAmount: false },
    ]);
  });

  it.each([['кофе $4'], ['кофе 4 usd'], ['кофе 4 доллара']])('«%s» is dollars too', (text) => {
    expect(parseOfflineText(text)?.[0]).toMatchObject({ amountMinor: 400, currency: 'USD', note: 'Кофе' });
  });

  it('«9,99$» keeps its cents', () => {
    expect(parseOfflineText('подписка 9,99$')?.[0]).toMatchObject({ amountMinor: 999, currency: 'USD' });
  });

  it('«45» without «к» is 45 000 with «проверьте сумму»', () => {
    expect(parseOfflineText('обед 45')).toEqual([
      { type: 'expense', amountMinor: 4_500_000, currency: 'UZS', note: 'Обед', presetKey: 'cafe', checkAmount: true },
    ]);
  });

  it.each([
    ['обед 45 000', 4_500_000],
    ['обед 45000 сум', 4_500_000],
    ['обед 45.000', 4_500_000],
    ['продукты 1,5 млн', 150_000_000],
    ['такси 18 тысяч', 1_800_000],
    ['бензин 120k', 12_000_000],
  ])('«%s» is read as written, without a question', (text, amountMinor) => {
    expect(parseOfflineText(text)?.[0]).toMatchObject({ amountMinor, currency: 'UZS', checkAmount: false });
  });

  it('a word that begins with «к» is not «тысяч»: «45 кофе» is 45 000 to check', () => {
    expect(parseOfflineText('45 кофе')?.[0]).toMatchObject({ amountMinor: 4_500_000, note: 'Кофе', checkAmount: true });
  });

  it('«зарплата 5 млн» is an income', () => {
    expect(parseOfflineText('зарплата 5 млн')?.[0]).toMatchObject({ type: 'income', amountMinor: 500_000_000, presetKey: 'salary' });
  });

  it('«пришло 300$» is an income in dollars', () => {
    expect(parseOfflineText('пришло 300$')?.[0]).toMatchObject({ type: 'income', amountMinor: 30_000, currency: 'USD', presetKey: null });
  });

  it.each([['привет'], ['такси'], ['такси 18к, что-то'], ['кофе 25к такси 18к'], ['кофе 0'], ['']])(
    '«%s» is not a simple «what and how much»',
    (text) => {
      expect(parseOfflineText(text)).toBeNull();
    }
  );
});

describe('the records the device writes', () => {
  it('go to the user’s starter categories, whatever they are called now', () => {
    const result = records('такси 18к, кофе 25к');

    expect(result).toEqual({
      ok: true,
      records: [
        { type: 'expense', amountMinor: 1_800_000, currency: 'UZS', accountId: 'card', categoryId: 'c-tr', categoryName: 'Такси и метро', date: '2026-10-14', note: 'Такси', checkAmount: false },
        { type: 'expense', amountMinor: 2_500_000, currency: 'UZS', accountId: 'card', categoryId: 'c-cafe', categoryName: 'Кафе', date: '2026-10-14', note: 'Кофе', checkAmount: false },
      ],
    });
  });

  it('a word the device does not know goes to «Другое» of its type', () => {
    expect(records('цветы 120к')).toMatchObject({ ok: true, records: [{ categoryId: 'c-other', categoryName: 'Другое', note: 'Цветы' }] });
    expect(records('пришло 300к')).toMatchObject({ ok: true, records: [{ type: 'income', categoryId: 'c-oinc' }] });
  });

  it('a bare brand of many services is not «Транспорт» on the device either: «яндекс 20к», «uber eats 120к» (FT-150)', () => {
    expect(records('яндекс 20к')).toMatchObject({ ok: true, records: [{ categoryId: 'c-other', note: 'Яндекс' }] });
    expect(records('uber eats 120к')).toMatchObject({ ok: true, records: [{ categoryId: 'c-other', note: 'Uber eats' }] });
  });

  it('«55$» goes to the dollar account', () => {
    expect(records('55$')).toMatchObject({ ok: true, records: [{ currency: 'USD', amountMinor: 5_500, accountId: 'usd' }] });
  });

  it('сум go to the default account, or the first one in сум when it is hidden', () => {
    const hiddenCard = [account('cash', 'Наличные', 'UZS'), account('card', 'Карта', 'UZS', true)];

    expect(records('такси 18к', { ...CONTEXT, accounts: hiddenCard })).toMatchObject({ ok: true, records: [{ accountId: 'cash' }] });
  });

  it('dollars without a dollar account are not written', () => {
    expect(records('55$', { ...CONTEXT, accounts: ACCOUNTS.slice(0, 2) })).toEqual({ ok: false, reason: 'no-dollar-account' });
  });

  it('without the accounts and categories read yet the server picks them when it gets the record', () => {
    expect(records('такси 18к', { ...CONTEXT, categories: [], accounts: [] })).toEqual({
      ok: true,
      records: [{ type: 'expense', amountMinor: 1_800_000, currency: 'UZS', categoryName: 'Такси', date: '2026-10-14', note: 'Такси', checkAmount: false }],
    });
  });
});
