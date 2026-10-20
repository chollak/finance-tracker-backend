import { describe, expect, it } from 'vitest';
import type { Account, AccountMove, AccountOperations, MoveOperation, RecordOperation } from '@/entities/account';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { Transaction } from '@/shared/types';
import { accountDays, accountHeader, moveDetails, transferAction } from './accountScreen';
import { HIDDEN_ACCOUNT, NEEDS_SECOND_ACCOUNT, TRANSFER_NOT_YET } from './notices';

/**
 * FT-118, boards «Счёт «Карта» · операции» and «Обмен · подробнее и удаление» (design-system «Экран счёта»,
 * AccountMoves.md): the balance large, the opening balance with its date, «Перевести» or «Обменять», then the
 * records and moves by day — records as in History, moves on a neutral circle with an ink amount — and the
 * sheet «Подробнее» of a move.
 */

const TODAY = '2026-10-14';

const CARD: Account = {
  id: 'card',
  name: 'Карта',
  kind: 'card',
  currency: 'UZS',
  openingBalanceMinor: 200_000_000,
  openingDate: '2026-08-01',
  isHidden: false,
  sortOrder: 20,
  balanceMinor: 318_000_000,
};
const USD: Account = { ...CARD, id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', openingBalanceMinor: 2_000, balanceMinor: 42_000 };

function record(id: string, overrides: Partial<Transaction>): RecordOperation {
  const full: Transaction = {
    id,
    type: 'expense',
    amount: 0,
    currency: 'UZS',
    category: 'Продукты',
    categoryId: 'c-food',
    description: '',
    date: TODAY,
    userId: 'u',
    accountId: 'card',
    ...overrides,
  };
  const minor = full.amountMinor ?? 0;
  return {
    type: 'record',
    id,
    date: full.date,
    createdAt: null,
    amountMinor: full.type === 'income' ? minor : -minor,
    countsInBalance: true,
    record: full,
  };
}

function move(overrides: Partial<AccountMove>, operation: Partial<MoveOperation> = {}): MoveOperation {
  const full: AccountMove = {
    id: 'm1',
    kind: 'exchange',
    fromAccountId: 'usd',
    toAccountId: 'card',
    fromAmountMinor: 10_000,
    toAmountMinor: 126_000_000,
    dealRateMinor: 1_260_000,
    cbuRateMinor: 1_265_000,
    date: '2026-10-12',
    note: null,
    createdAt: '2026-10-12T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
  return {
    type: 'move',
    id: full.id,
    date: full.date,
    createdAt: full.createdAt,
    amountMinor: full.toAccountId === 'card' ? full.toAmountMinor : -(full.fromAmountMinor ?? 0),
    countsInBalance: true,
    kind: full.kind,
    counterpart: full.kind === 'adjustment' ? null : { id: 'usd', name: 'Доллары', currency: 'USD' },
    move: full,
    ...operation,
  };
}

const CATEGORIES: Record<string, { name: string; color: 'peach' | 'mint' }> = {
  'c-food': { name: 'Продукты', color: 'peach' },
  'c-salary': { name: 'Зарплата', color: 'mint' },
};
const categoryOf = (item: Transaction) => (item.categoryId ? CATEGORIES[item.categoryId] : undefined);

describe('account screen', () => {
  it('shows the balance large, the opening balance with its date and «Перевести»', () => {
    expect(accountHeader(CARD, TODAY)).toEqual({
      caption: 'сумы · карта',
      balance: `3${NBSP}180${NBSP}000`,
      unit: 'сум',
      initialText: `Начальный остаток 2${NBSP}000${NBSP}000${NBSP}сум на 1 августа`,
      moveLabel: 'Перевести',
    });
  });

  it('a dollar account exchanges; an account opened today says so; another year is named', () => {
    expect(accountHeader(USD, TODAY)).toMatchObject({ balance: '420,00', unit: 'USD', moveLabel: 'Обменять', caption: 'доллары · наличные' });
    expect(accountHeader({ ...CARD, openingDate: TODAY }, TODAY).initialText).toBe(
      `Начальный остаток 2${NBSP}000${NBSP}000${NBSP}сум · счёт добавлен сегодня`
    );
    expect(accountHeader({ ...CARD, openingDate: '2025-12-01' }, TODAY).initialText).toBe(
      `Начальный остаток 2${NBSP}000${NBSP}000${NBSP}сум на 1 декабря 2025`
    );
  });

  it('a hidden account says so under its name', () => {
    expect(accountHeader({ ...CARD, isHidden: true }, TODAY).caption).toBe('сумы · карта · скрыт');
  });

  it('«Перевести» is off for a hidden account and with one visible account, each saying its own reason', () => {
    expect(transferAction(CARD, 3)).toEqual({ available: true, notice: TRANSFER_NOT_YET });
    expect(transferAction(CARD, 1)).toEqual({ available: false, notice: NEEDS_SECOND_ACCOUNT });
    // Hidden: whatever else is visible, the reason is this account
    expect(transferAction({ ...CARD, isHidden: true }, 2)).toEqual({ available: false, notice: HIDDEN_ACCOUNT });
    expect(HIDDEN_ACCOUNT.title).toBe('Счёт скрыт');
  });

  it('lists records and moves by day in the order the server gives, records as in History', () => {
    const operations: AccountOperations = {
      account: { ...CARD, hasOperations: true },
      days: [
        { date: TODAY, operations: [record('t1', { amountMinor: 18_640_000, description: 'Супермаркет' })] },
        {
          date: '2026-10-13',
          operations: [record('t3', { type: 'income', categoryId: 'c-salary', category: 'Зарплата', amountMinor: 1_250_000_000, date: '2026-10-13', description: 'За сентябрь' })],
        },
        { date: '2026-10-12', operations: [move({})] },
      ],
    };

    const days = accountDays(operations, { today: TODAY, categoryOf });

    expect(days.map((day) => day.label)).toEqual(['Сегодня, 14 октября', 'Вчера, 13 октября', 'Понедельник, 12 октября']);
    const first = days[0].items[0];
    expect(first.type === 'record' && [first.row.title, first.row.note, first.row.amount, first.row.tone]).toEqual([
      'Продукты',
      'Супермаркет',
      `${MINUS}186${NBSP}400`,
      'expense',
    ]);
    // A record opens in History (board: «… Открыть в истории»)
    expect(first.type === 'record' && first.row.ariaLabel).toBe(`Продукты, ${MINUS}186${NBSP}400${NBSP}сум, Супермаркет. Открыть в истории`);
    const salary = days[1].items[0];
    expect(salary.type === 'record' && [salary.row.amount, salary.row.tone]).toEqual([`+12${NBSP}500${NBSP}000`, 'income']);
    const exchange = days[2].items[0];
    expect(exchange.type === 'move' && exchange.row).toEqual({
      id: 'm1',
      icon: 'move',
      title: 'Обмен',
      caption: 'Доллары → Карта',
      amount: `+1${NBSP}260${NBSP}000`,
      ariaLabel: `Обмен, Доллары → Карта, +1${NBSP}260${NBSP}000${NBSP}сум. Не в аналитике. Подробнее`,
    });
  });

  it('a transfer out is minus with the counterpart after the arrow; an adjustment is «±»; dollars carry their unit', () => {
    const operations: AccountOperations = {
      account: { ...CARD, hasOperations: true },
      days: [
        {
          date: '2026-10-10',
          operations: [
            move({ id: 'm2', kind: 'transfer', fromAccountId: 'card', toAccountId: 'cash', fromAmountMinor: 30_000_000, toAmountMinor: 30_000_000, dealRateMinor: null, cbuRateMinor: null }, {
              amountMinor: -30_000_000,
              counterpart: { id: 'cash', name: 'Наличные', currency: 'UZS' },
            }),
            move({ id: 'm3', kind: 'adjustment', fromAccountId: null, toAccountId: 'card', fromAmountMinor: null, toAmountMinor: 2_000_000, dealRateMinor: null, cbuRateMinor: null }),
          ],
        },
      ],
    };

    const [transfer, adjustment] = accountDays(operations, { today: TODAY, categoryOf })[0].items;
    expect(transfer.type === 'move' && [transfer.row.title, transfer.row.caption, transfer.row.amount, transfer.row.icon]).toEqual([
      'Перевод',
      'Карта → Наличные',
      `${MINUS}300${NBSP}000`,
      'move',
    ]);
    expect(adjustment.type === 'move' && [adjustment.row.title, adjustment.row.caption, adjustment.row.amount, adjustment.row.icon]).toEqual([
      'Корректировка',
      'Остаток сверен вручную',
      `+20${NBSP}000`,
      'adjust',
    ]);

    const inDollars = accountDays(
      { account: { ...USD, hasOperations: true }, days: [{ date: '2026-10-12', operations: [move({}, { amountMinor: -10_000, counterpart: { id: 'card', name: 'Карта', currency: 'UZS' } })] }] },
      { today: TODAY, categoryOf }
    )[0].items[0];
    expect(inDollars.type === 'move' && [inDollars.row.caption, inDollars.row.amount]).toEqual(['Доллары → Карта', `${MINUS}100,00${NBSP}USD`]);
  });

  it('«Подробнее» of an exchange: what was given, received and the deal rate; deleting returns both balances', () => {
    expect(moveDetails(move({}), CARD, TODAY)).toEqual({
      title: 'Обмен, 12 октября',
      rows: [
        { label: 'Отдали', value: `100,00${NBSP}USD · Доллары` },
        { label: 'Получили', value: `1${NBSP}260${NBSP}000${NBSP}сум · Карта` },
        { label: 'Курс сделки', value: `12${NBSP}600 сум за $1` },
      ],
      note: 'Обмен не попадает в расходы и аналитику. Удаление вернёт остатки обоих счетов.',
      deleteLabel: 'Удалить обмен',
      deleted: { title: 'Обмен удалён', detail: `100,00${NBSP}USD → 1${NBSP}260${NBSP}000${NBSP}сум` },
    });
  });

  it('«Подробнее» of a transfer and of an adjustment', () => {
    const transfer = move(
      { id: 'm2', kind: 'transfer', fromAccountId: 'card', toAccountId: 'cash', fromAmountMinor: 30_000_000, toAmountMinor: 30_000_000, dealRateMinor: null, cbuRateMinor: null, date: '2026-10-10' },
      { amountMinor: -30_000_000, counterpart: { id: 'cash', name: 'Наличные', currency: 'UZS' } }
    );
    expect(moveDetails(transfer, CARD, TODAY)).toMatchObject({
      title: 'Перевод, 10 октября',
      rows: [
        { label: 'Откуда', value: `300${NBSP}000${NBSP}сум · Карта` },
        { label: 'Куда', value: `300${NBSP}000${NBSP}сум · Наличные` },
      ],
      note: 'Перевод не попадает в расходы и аналитику. Удаление вернёт остатки обоих счетов.',
      deleteLabel: 'Удалить перевод',
      deleted: { title: 'Перевод удалён', detail: `Карта → Наличные · 300${NBSP}000${NBSP}сум` },
    });

    const adjustment = move({ id: 'm3', kind: 'adjustment', fromAccountId: null, toAccountId: 'card', fromAmountMinor: null, toAmountMinor: -2_000_000, dealRateMinor: null, cbuRateMinor: null, date: '2026-10-10' });
    expect(moveDetails(adjustment, CARD, TODAY)).toEqual({
      title: 'Корректировка, 10 октября',
      rows: [
        { label: 'Счёт', value: 'Карта' },
        { label: 'Разница', value: `${MINUS}20${NBSP}000${NBSP}сум` },
      ],
      note: 'Корректировка не попадает в расходы и аналитику. Если сверили по ошибке — удалите её, остаток вернётся.',
      deleteLabel: 'Удалить корректировку',
      deleted: { title: 'Корректировка удалена', detail: `Карта · ${MINUS}20${NBSP}000${NBSP}сум` },
    });
  });
});
