import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';
import { addDaysToDateOnly } from '../../../../shared/domain/dates/dateOnly';
import {
  PickerAccount,
  quoted,
  recordName,
  RecordMessageInput,
  RecordView,
  selectedRecord,
  shortAmount,
} from '../formatters/recordMessage';

/**
 * Buttons under a record message (FT-122, docs/pastel/components/BotKeyboard.md): at most two in a row,
 * the frequent action first, cancelling last on its own row, a link to the app always alone in its row.
 * Callback data is `r:<verb>[:<arg>]`; the message the button is under names the records.
 */

export const RECORD_VERBS = {
  edit: 'e',
  pick: 'p',
  field: 'f',
  back: 'b',
  done: 'ok',
  category: 'c',
  switchType: 't',
  account: 'a',
  date: 'd',
  cancel: 'x',
  revert: 'v',
  /** «Вернуть» under the /undo reply; the argument is the message whose records it cancelled. */
  undoRevert: 'u',
} as const;

export type RecordVerb = (typeof RECORD_VERBS)[keyof typeof RECORD_VERBS];

/** `r:<verb>` with an optional argument. */
export const RECORD_CALLBACK_PATTERN = /^r:([a-z]+)(?::(.+))?$/;

export function recordCallback(verb: RecordVerb, arg?: string | number): string {
  return arg === undefined ? `r:${verb}` : `r:${verb}:${arg}`;
}

/** More records than this get a button each up to MORE_RECORDS_SHOWN and a link to the rest. */
const MAX_RECORD_BUTTONS = 6;
const MORE_RECORDS_SHOWN = 5;

const CHECK = '✓ ';

type Button = InlineKeyboardButton.CallbackButton | InlineKeyboardButton.WebAppButton;

function button(label: string, verb: RecordVerb, arg?: string | number): Button {
  return Markup.button.callback(label, recordCallback(verb, arg));
}

function link(label: string, url: string | undefined): Button[] {
  return url ? [Markup.button.webApp(`${label} ↗`, url)] : [];
}

function pairs(buttons: Button[]): Button[][] {
  const rows: Button[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

function ticked(label: string, current: boolean): string {
  return current ? `${CHECK}${label}` : label;
}

/** Visible accounts the record can move to without changing its currency. */
export function accountsFor(record: RecordView, accounts: PickerAccount[]): PickerAccount[] {
  return accounts.filter(account => account.currency === record.currency);
}

function confirmRows(input: RecordMessageInput): Button[][] {
  const { records } = input;
  if (records.length === 1) return [[button('Изменить', RECORD_VERBS.edit), button('Отменить', RECORD_VERBS.cancel)]];

  const shown = records.length > MAX_RECORD_BUTTONS ? records.slice(0, MORE_RECORDS_SHOWN) : records;
  const rows: Button[][] = shown.map((record, index) => [record.cancelled
    ? button(`Вернуть ${quoted(recordName(record))}`, RECORD_VERBS.revert, index)
    : button(`${shortAmount(record)} · ${quoted(recordName(record))}`, RECORD_VERBS.pick, index)]);
  if (records.length > MAX_RECORD_BUTTONS) {
    const more = link('Остальные — в Daftar', input.historyUrl);
    if (more.length) rows.push(more);
  }
  if (records.some(record => !record.cancelled)) rows.push([button('Отменить все', RECORD_VERBS.cancel)]);
  return rows;
}

function editRows(input: RecordMessageInput, record: RecordView): Button[][] {
  const canMove = accountsFor(record, input.accounts).length > 1;
  const rows: Button[][] = [
    [button('Сумму', RECORD_VERBS.field, 'amount'), button('Категорию', RECORD_VERBS.field, 'category')],
    canMove ? [button('Счёт', RECORD_VERBS.field, 'account'), button('Дату', RECORD_VERBS.field, 'date')] : [button('Дату', RECORD_VERBS.field, 'date')],
  ];
  const app = link('Открыть в Daftar', input.recordUrl?.(record.id));
  if (app.length) rows.push(app);
  rows.push([button('Готово', RECORD_VERBS.done)]);
  rows.push([button(input.records.length > 1 ? `Отменить ${quoted(recordName(record))}` : 'Отменить запись', RECORD_VERBS.cancel)]);
  return rows;
}

function categoryRows(input: RecordMessageInput, record: RecordView): Button[][] {
  const type = input.state.pickType ?? record.type;
  const tickable = type === record.type && !input.state.guessed.includes(record.id);
  const categories = input.categories.filter(category => category.type === type);
  return [
    ...pairs(categories.map(category =>
      button(ticked(category.name, tickable && category.id === record.categoryId), RECORD_VERBS.category, category.id))),
    [button(type === 'income' ? 'Это расход' : 'Это доход', RECORD_VERBS.switchType), button('‹ Назад', RECORD_VERBS.back)],
  ];
}

function accountRows(input: RecordMessageInput, record: RecordView): Button[][] {
  return [
    ...pairs(accountsFor(record, input.accounts).map(account =>
      button(ticked(account.name, account.id === record.accountId), RECORD_VERBS.account, account.id))),
    [button('‹ Назад', RECORD_VERBS.back)],
  ];
}

function dateRows(input: RecordMessageInput, record: RecordView): Button[][] {
  const day = (offset: number) => addDaysToDateOnly(input.today, -offset);
  const option = (label: string, offset: number) => button(ticked(label, record.date === day(offset)), RECORD_VERBS.date, day(offset));
  const rows: Button[][] = [[option('Сегодня', 0), option('Вчера', 1)], [option('Позавчера', 2)]];
  const other = link('Другая дата', input.recordUrl?.(record.id));
  if (other.length) rows.push(other);
  rows.push([button('‹ Назад', RECORD_VERBS.back)]);
  return rows;
}

/** How many records «Вернуть» of a cancelled message brings back: after /undo, only the ones it cancelled. */
function revertCount(input: RecordMessageInput): number {
  const undone = input.state.undone ?? [];
  const back = input.records.filter(record => undone.includes(record.id)).length;
  return back > 0 ? back : input.records.length;
}

/** The inline keyboard for the message's current screen. */
export function recordKeyboard(input: RecordMessageInput): Button[][] {
  const { records } = input;
  if (records.length === 0) return [];
  if (records.every(record => record.cancelled)) {
    return [[button(revertCount(input) > 1 ? 'Вернуть все' : 'Вернуть', RECORD_VERBS.revert)]];
  }

  const record = selectedRecord(input)!;
  switch (input.mode) {
    case 'edit':
      return editRows(input, record);
    case 'category':
      return categoryRows(input, record);
    case 'account':
      return accountRows(input, record);
    case 'date':
      return dateRows(input, record);
    case 'amount':
      return [[button('‹ Назад', RECORD_VERBS.back)]];
    default:
      return confirmRows(input);
  }
}
