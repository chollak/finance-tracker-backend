import { accountCaption, type Account, type AccountOperations, type MoveOperation } from '@/entities/account';
import { recordRow, type RecordCategory, type RecordRow } from '@/entities/transaction';
import { dayGroupLabel, dayMonth, parseLocalDate, type LocalDate } from '@/shared/lib/dates';
import { CURRENCY_UNIT, formatMinor, type Currency } from '@/shared/lib/money';
import type { Transaction } from '@/shared/types';
import { HIDDEN_ACCOUNT, NEEDS_SECOND_ACCOUNT, TRANSFER_NOT_YET } from './notices';

export interface AccountHeader {
  /** «сумы · карта»; a hidden account says so: «сумы · карта · скрыт». */
  caption: string;
  /** «3 180 000», «420,00»; the unit beside it. */
  balance: string;
  unit: string;
  /** «Начальный остаток 2 000 000 сум на 1 августа». */
  initialText: string;
  /** A dollar account exchanges, the others transfer (design-system «Экран счёта»). */
  moveLabel: 'Перевести' | 'Обменять';
}

/** «1 августа»; another year than today's carries it: «1 декабря 2025». */
function dateText(date: LocalDate, today: LocalDate): string {
  const sameYear = parseLocalDate(date).year === parseLocalDate(today).year;
  return `${dayMonth(date)}${sameYear ? '' : ` ${parseLocalDate(date).year}`}`;
}

/** The opening balance with its date, as the account screen and its «Изменить» name it. */
export function openingText(account: Account, today: LocalDate, style: 'screen' | 'sheet'): string {
  const amount = formatMinor(account.openingBalanceMinor, account.currency);
  if (account.openingDate === today) return style === 'screen' ? `${amount} · счёт добавлен сегодня` : `${amount} · сегодня`;
  return style === 'screen' ? `${amount} на ${dateText(account.openingDate, today)}` : `${amount} · на ${dateText(account.openingDate, today)}`;
}

/** The top of the account screen: the balance large, the opening balance with its date, the move action. */
export function accountHeader(account: Account, today: LocalDate): AccountHeader {
  return {
    caption: `${accountCaption(account)}${account.isHidden ? ' · скрыт' : ''}`,
    balance: formatMinor(account.balanceMinor, account.currency, { unit: false }),
    unit: CURRENCY_UNIT[account.currency],
    initialText: `Начальный остаток ${openingText(account, today, 'screen')}`,
    moveLabel: account.currency === 'USD' ? 'Обменять' : 'Перевести',
  };
}

/**
 * «Перевести» / «Обменять» of the account screen: off — and saying why — for a hidden account and while only one
 * account is visible (design-system «Скрыть, а не удалить»); until FT-119 brings the form it says it is coming.
 */
export function transferAction(account: Pick<Account, 'isHidden'>, visibleCount: number): { available: boolean; notice: { title: string; detail: string } } {
  if (account.isHidden) return { available: false, notice: HIDDEN_ACCOUNT };
  if (visibleCount < 2) return { available: false, notice: NEEDS_SECOND_ACCOUNT };
  return { available: true, notice: TRANSFER_NOT_YET };
}

export interface MoveRow {
  id: string;
  /** Two arrows for a transfer and an exchange, «±» for an adjustment (AccountMoves.md). */
  icon: 'move' | 'adjust';
  title: string;
  /** «Доллары → Карта», «Остаток сверен вручную». */
  caption: string;
  /** Always ink with its sign: a move is not income. Сум without a unit, dollars with one. */
  amount: string;
  ariaLabel: string;
}

export type OperationItem =
  | { type: 'record'; id: string; row: RecordRow; record: Transaction }
  | { type: 'move'; id: string; row: MoveRow; operation: MoveOperation };

export interface OperationDay {
  day: LocalDate;
  /** «Сегодня, 14 октября», «Понедельник, 12 октября». */
  label: string;
  items: OperationItem[];
}

const MOVE_TITLE = { transfer: 'Перевод', exchange: 'Обмен', adjustment: 'Корректировка' } as const;

/** Where the money went, as an arrow: the account it left, then the one it reached. */
function direction(operation: MoveOperation, account: Pick<Account, 'id' | 'name'>): { from: string; to: string } {
  const other = operation.counterpart?.name ?? '';
  return operation.move.fromAccountId === account.id ? { from: account.name, to: other } : { from: other, to: account.name };
}

function moveRow(operation: MoveOperation, account: Account): MoveRow {
  const title = MOVE_TITLE[operation.kind];
  const adjustment = operation.kind === 'adjustment';
  const { from, to } = direction(operation, account);
  const caption = adjustment ? 'Остаток сверен вручную' : `${from} → ${to}`;
  const currency: Currency = account.currency;
  return {
    id: operation.id,
    icon: adjustment ? 'adjust' : 'move',
    title,
    caption,
    amount: formatMinor(operation.amountMinor, currency, { sign: 'always', unit: currency !== 'UZS' }),
    ariaLabel: `${title}, ${caption}, ${formatMinor(operation.amountMinor, currency, { sign: 'always' })}. Не в аналитике. Подробнее`,
  };
}

/**
 * The operations of the account by day, in the server's order (newest first, inside a day by when they were made):
 * records exactly as History shows them — a row opens the record in History — and moves among them on a neutral
 * circle (design-system «Экран счёта»).
 */
export function accountDays(
  operations: AccountOperations,
  context: { today: LocalDate; categoryOf: (record: Transaction) => RecordCategory | undefined }
): OperationDay[] {
  const { account } = operations;
  return operations.days.map((day) => ({
    day: day.date,
    label: dayGroupLabel(day.date, context.today, { withDate: true }),
    items: day.operations.map((operation): OperationItem =>
      operation.type === 'record'
        ? { type: 'record', id: operation.id, row: recordRow(operation.record, { categoryOf: context.categoryOf, opens: 'history' }), record: operation.record }
        : { type: 'move', id: operation.id, row: moveRow(operation, account), operation }
    ),
  }));
}

export interface MoveDetails {
  /** «Обмен, 12 октября». */
  title: string;
  /** «подпись сверху, значение снизу» (AccountMoves.md). */
  rows: Array<{ label: string; value: string }>;
  note: string;
  deleteLabel: string;
  /** The toast after the delete. */
  deleted: { title: string; detail: string };
}

/** The sheet «Подробнее» of a transfer, an exchange or an adjustment, opened from the account screen. */
export function moveDetails(operation: MoveOperation, account: Account, today: LocalDate): MoveDetails {
  const { move } = operation;
  const day = dateText(move.date.slice(0, 10), today);

  if (operation.kind === 'adjustment') {
    const difference = formatMinor(move.toAmountMinor, account.currency, { sign: 'always' });
    return {
      title: `Корректировка, ${day}`,
      rows: [
        { label: 'Счёт', value: account.name },
        { label: 'Разница', value: difference },
      ],
      note: 'Корректировка не попадает в расходы и аналитику. Если сверили по ошибке — удалите её, остаток вернётся.',
      deleteLabel: 'Удалить корректировку',
      deleted: { title: 'Корректировка удалена', detail: `${account.name} · ${difference}` },
    };
  }

  const outgoing = move.fromAccountId === account.id;
  const other = { name: operation.counterpart?.name ?? '', currency: operation.counterpart?.currency ?? account.currency };
  const from = outgoing ? { name: account.name, currency: account.currency } : other;
  const to = outgoing ? other : { name: account.name, currency: account.currency };
  const given = formatMinor(move.fromAmountMinor ?? 0, from.currency);
  const received = formatMinor(move.toAmountMinor, to.currency);
  const exchange = operation.kind === 'exchange';
  const word = exchange ? 'Обмен' : 'Перевод';

  const rows = [
    { label: exchange ? 'Отдали' : 'Откуда', value: `${given} · ${from.name}` },
    { label: exchange ? 'Получили' : 'Куда', value: `${received} · ${to.name}` },
  ];
  if (exchange && move.dealRateMinor !== null) {
    rows.push({ label: 'Курс сделки', value: `${formatMinor(move.dealRateMinor, 'UZS', { unit: false })} сум за $1` });
  }
  return {
    title: `${word}, ${day}`,
    rows,
    note: `${word} не попадает в расходы и аналитику. Удаление вернёт остатки обоих счетов.`,
    deleteLabel: exchange ? 'Удалить обмен' : 'Удалить перевод',
    deleted: {
      title: exchange ? 'Обмен удалён' : 'Перевод удалён',
      detail: exchange ? `${given} → ${received}` : `${from.name} → ${to.name} · ${given}`,
    },
  };
}
