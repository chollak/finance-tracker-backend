import { describe, expect, it } from 'vitest';
import type { KeypadKey } from '@/shared/lib/money';
import { NBSP } from '@/shared/lib/money';
import {
  chooseTransferAccount,
  focusTransferField,
  pressTransferKey,
  startTransfer,
  swapTransfer,
  transferView,
  type TransferAccount,
  type TransferContext,
  type TransferState,
} from './transferForm';

/**
 * FT-119, boards «Перевод между счетами», «Обмен сумы → доллары» (TransferForm.md, design-system «Перевод и обмен —
 * одна форма»): one form; the same currency is a transfer, different ones an exchange «Отдаю / Получаю» where
 * «Получаю» is first counted at the Central Bank rate with a label; a typed «Получаю» shows the deal rate and the
 * difference in words; the form says the move is not an expense.
 */

const CASH: TransferAccount = { id: 'cash', name: 'Наличные', kind: 'cash', currency: 'UZS', balanceMinor: 125_000_000 };
const CARD: TransferAccount = { id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', balanceMinor: 318_000_000 };
const USD: TransferAccount = { id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', balanceMinor: 42_000 };
const BOARD: TransferContext = { accounts: [CASH, CARD, USD], cbuRateMinor: 1_265_000 };

/** Money as formatMinor writes it: digit groups and the unit after a non-breaking space. */
const sum = (text: string) => rate(text).replace(/(\d) (сум|USD)/g, `$1${NBSP}$2`);
/** A rate: digit groups only, « сум за $1» after a plain space (as the rate row and «Подробнее» say it, FT-118). */
const rate = (text: string) => text.replace(/(\d) (?=\d)/g, `$1${NBSP}`);

function typeKeys(state: TransferState, keys: KeypadKey[], context = BOARD): TransferState {
  return keys.reduce((current, key) => pressTransferKey(current, key, context), state);
}
const digits = (value: string) => value.split('') as KeypadKey[];

function start(fromId?: string, context = BOARD): TransferState {
  const state = startTransfer(context.accounts, fromId);
  if (!state) throw new Error('no transfer');
  return state;
}

/** The board «Обмен сумы → доллары»: 1 280 000 сум from the card, 100 USD received. */
function boardExchange(): TransferState {
  let state = chooseTransferAccount(start(), 'to', 'usd', BOARD);
  state = typeKeys(state, digits('1280000'));
  state = focusTransferField(state, 'in', BOARD);
  return typeKeys(state, digits('100'));
}

describe('transfer — one currency', () => {
  it('starts from the card to another сум account and waits for the amount', () => {
    const view = transferView(start(), BOARD);

    expect(view.kind).toBe('transfer');
    expect(view.title).toBe('Перевод');
    expect(view.from).toMatchObject({ label: 'Откуда', accountName: 'Карта', note: sum('На счёте 3 180 000 сум'), warning: false });
    expect(view.from.amount).toEqual({ text: '0', placeholder: true, unit: 'сум' });
    expect(view.to).toMatchObject({ label: 'Куда', accountName: 'Наличные', amount: null, byCbu: false });
    expect(view.note).toBe('Перевод не попадает в расходы и аналитику — деньги просто меняют счёт.');
    expect(view.deal).toBeNull();
    expect(view.button).toEqual({ label: 'Введите сумму', ready: false });
    expect(view.payload).toBeNull();
  });

  it('says what becomes of both accounts and names the action with the amount', () => {
    const view = transferView(typeKeys(start(), digits('500'), BOARD), BOARD);
    const typed = transferView(typeKeys(start(), [...digits('500'), '000']), BOARD);

    expect(view.from.amount).toEqual({ text: '500', placeholder: false, unit: 'сум' });
    expect(typed.from.note).toBe(sum('На счёте 3 180 000 сум · останется 2 680 000 сум'));
    expect(typed.to.note).toBe(sum('На счёте 1 250 000 сум · станет 1 750 000 сум'));
    expect(typed.button).toEqual({ label: sum('Перевести 500 000 сум'), ready: true });
    expect(typed.payload).toEqual({ kind: 'transfer', fromAccountId: 'card', toAccountId: 'cash', amountMinor: 50_000_000 });
    expect(typed.saved).toEqual({ title: 'Перевод записан', detail: sum('Карта → Наличные · 500 000 сум') });
  });

  it('more than is on the account: says so in ink and the button cannot send it', () => {
    const view = transferView(typeKeys(start(), [...digits('4'), '000', '000']), BOARD);

    expect(view.from.note).toBe(sum('На счёте «Карта» только 3 180 000 сум — меньше суммы'));
    expect(view.from.warning).toBe(true);
    expect(view.button).toEqual({ label: 'Не хватает денег на счёте', ready: false });
    expect(view.payload).toBeNull();
    expect(view.liveText).toBe(sum('Не хватает денег: на счёте «Карта» 3 180 000 сум'));
  });

  it('swaps the accounts', () => {
    const swapped = swapTransfer(typeKeys(start(), digits('5')), BOARD);
    const view = transferView(swapped, BOARD);

    expect(view.from.accountName).toBe('Наличные');
    expect(view.to.accountName).toBe('Карта');
    expect(view.from.amount.text).toBe('5');
  });
});

describe('exchange — different currencies', () => {
  it('«Отдаю / Получаю», and «Получаю» first counted at the Central Bank rate with a label', () => {
    const state = typeKeys(chooseTransferAccount(start(), 'to', 'usd', BOARD), digits('1280000'));
    const view = transferView(state, BOARD);

    expect(view.kind).toBe('exchange');
    expect(view.title).toBe('Обмен');
    expect(view.from.label).toBe('Отдаю');
    expect(view.to.label).toBe('Получаю');
    expect(view.to.byCbu).toBe(true);
    // 1 280 000 / 12 650 = 101,186… → 101,19
    expect(view.to.amount).toEqual({ text: '101,19', placeholder: true, unit: 'USD' });
    expect(view.to.note).toBe(sum('На счёте 420,00 USD · станет 521,19 USD'));
    expect(view.note).toBe('Введите, сколько пришло на самом деле, — запишу точный курс. Обмен не попадает в расходы и аналитику.');
    expect(view.deal).toBeNull();
    // The amount at the Central Bank rate can be sent as it is
    expect(view.button).toEqual({ label: sum('Обменять 1 280 000 сум'), ready: true });
    expect(view.payload).toEqual({ kind: 'exchange', fromAccountId: 'card', toAccountId: 'usd', fromAmountMinor: 128_000_000, toAmountMinor: 10_119 });
  });

  it('an empty «Получаю» is written as its account writes money: «0,00» for dollars, «0» for сум (FT-141)', () => {
    const toDollars = transferView(chooseTransferAccount(start(), 'to', 'usd', BOARD), BOARD);
    expect(toDollars.to.amount).toEqual({ text: '0,00', placeholder: true, unit: 'USD' });

    const toSum = transferView(start('usd'), BOARD);
    expect(toSum.kind).toBe('exchange');
    expect(toSum.to.amount).toEqual({ text: '0', placeholder: true, unit: 'сум' });
  });

  it('a typed «Получаю» gives the deal rate and the difference with the Central Bank in words', () => {
    const view = transferView(boardExchange(), BOARD);

    expect(view.to.byCbu).toBe(false);
    expect(view.to.amount).toEqual({ text: '100', placeholder: false, unit: 'USD' });
    expect(view.to.active).toBe(true);
    expect(view.to.ring).toBe(true);
    expect(view.from.ring).toBe(false);
    expect(view.keypadCurrency).toBe('USD');
    expect(view.to.note).toBe(sum('На счёте 420,00 USD · станет 520,00 USD'));
    expect(view.from.note).toBe(sum('На счёте 3 180 000 сум · останется 1 900 000 сум'));
    expect(view.deal).toEqual({
      title: rate('Курс сделки: 12 800 сум за $1'),
      text: sum('По курсу ЦБ — 1 265 000 сум, разница 15 000 сум не в вашу пользу.'),
    });
    expect(view.note).toBe('Обмен не попадает в расходы и аналитику. Курс сделки сохранится в записи.');
    expect(view.button).toEqual({ label: sum('Обменять 1 280 000 сум'), ready: true });
    expect(view.payload).toEqual({ kind: 'exchange', fromAccountId: 'card', toAccountId: 'usd', fromAmountMinor: 128_000_000, toAmountMinor: 10_000 });
    expect(view.saved).toEqual({ title: 'Обмен записан', detail: sum('1 280 000 сум → 100,00 USD') });
    expect(view.liveText).toBe(rate('Курс сделки 12 800 сум за доллар'));
  });

  it('a better deal than the Central Bank is «в вашу пользу», the same rate is said plainly', () => {
    let better = chooseTransferAccount(start(), 'to', 'usd', BOARD);
    better = focusTransferField(typeKeys(better, digits('1250000')), 'in', BOARD);
    expect(transferView(typeKeys(better, digits('100')), BOARD).deal?.text).toBe(
      sum('По курсу ЦБ — 1 265 000 сум, разница 15 000 сум в вашу пользу.')
    );

    let same = chooseTransferAccount(start(), 'to', 'usd', BOARD);
    same = focusTransferField(typeKeys(same, digits('1265000')), 'in', BOARD);
    expect(transferView(typeKeys(same, digits('100')), BOARD).deal?.text).toBe('Ровно по курсу ЦБ.');
  });

  it('dollars to сум: fewer сум than the Central Bank gives is not in your favour', () => {
    let state = start('usd');
    const opened = transferView(state, BOARD);
    // A dollar account exchanges by default: to a сум account
    expect(opened.kind).toBe('exchange');
    expect(opened.from.accountName).toBe('Доллары');
    expect(opened.to.accountName).toBe('Наличные');

    state = typeKeys(state, digits('100'));
    expect(transferView(state, BOARD).to.amount).toEqual({ text: sum('1 265 000'), placeholder: true, unit: 'сум' });
    state = typeKeys(focusTransferField(state, 'in', BOARD), digits('1260000'));
    expect(transferView(state, BOARD).deal).toEqual({
      title: rate('Курс сделки: 12 600 сум за $1'),
      text: sum('По курсу ЦБ — 1 265 000 сум, разница 5 000 сум не в вашу пользу.'),
    });
  });

  it('«⌫» edits the Central Bank hint, the first digit replaces it', () => {
    const counted = focusTransferField(typeKeys(chooseTransferAccount(start(), 'to', 'usd', BOARD), digits('1280000')), 'in', BOARD);

    expect(transferView(pressTransferKey(counted, 'del', BOARD), BOARD).to.amount).toEqual({ text: '101,1', placeholder: false, unit: 'USD' });
    expect(transferView(pressTransferKey(counted, '9', BOARD), BOARD).to.amount?.text).toBe('9');
    // Back to «Отдаю»: the number stays, the next digit starts it again
    const back = focusTransferField(typeKeys(counted, ['9']), 'out', BOARD);
    expect(transferView(back, BOARD).from.active).toBe(true);
    expect(transferView(typeKeys(back, ['2']), BOARD).from.amount.text).toBe('2');
  });

  it('swapping an exchange keeps the deal, the other way round', () => {
    const view = transferView(swapTransfer(boardExchange(), BOARD), BOARD);

    expect(view.from.accountName).toBe('Доллары');
    expect(view.to.accountName).toBe('Карта');
    expect(view.from.amount.text).toBe('100');
    expect(view.to.amount).toEqual({ text: sum('1 280 000'), placeholder: false, unit: 'сум' });
    expect(view.from.active).toBe(true);
  });

  it('another account starts «Получаю» from the Central Bank again; another currency of «Отдаю» clears the amount', () => {
    const otherTo = transferView(chooseTransferAccount(boardExchange(), 'to', 'cash', BOARD), BOARD);
    expect(otherTo.kind).toBe('transfer');
    expect(otherTo.from.amount.text).toBe(sum('1 280 000'));

    const otherFrom = transferView(chooseTransferAccount(boardExchange(), 'from', 'cash', BOARD), BOARD);
    expect(otherFrom.to.byCbu).toBe(true);
    expect(otherFrom.from.amount.text).toBe(sum('1 280 000'));

    // The card gives the dollars instead: «Отдаю» changes currency, so the amount is typed again
    const fromUsd = transferView(chooseTransferAccount(chooseTransferAccount(start(), 'to', 'cash', BOARD), 'from', 'usd', BOARD), BOARD);
    expect(fromUsd.from.amount).toEqual({ text: '0', placeholder: true, unit: 'USD' });
  });

  it('without a Central Bank rate «Получаю» is typed by hand and there is nothing to compare with', () => {
    const context: TransferContext = { ...BOARD, cbuRateMinor: null };
    let state = typeKeys(chooseTransferAccount(start(undefined, context), 'to', 'usd', context), digits('1280000'), context);
    const waiting = transferView(state, context);
    expect(waiting.to.byCbu).toBe(false);
    expect(waiting.to.amount).toEqual({ text: '0,00', placeholder: true, unit: 'USD' });
    expect(waiting.button).toEqual({ label: 'Введите, сколько получили', ready: false });

    state = typeKeys(focusTransferField(state, 'in', context), digits('100'), context);
    expect(transferView(state, context).deal).toEqual({ title: rate('Курс сделки: 12 800 сум за $1'), text: 'Курса ЦБ пока нет — сравнить не с чем.' });
  });
});

describe('the accounts of the form', () => {
  it('a picker never offers the account of the other side', () => {
    const view = transferView(chooseTransferAccount(start(), 'to', 'usd', BOARD), BOARD);

    expect(view.picker.from.title).toBe('Отдаю со счёта');
    expect(view.picker.from.accounts.map((account) => account.id)).toEqual(['cash', 'card']);
    expect(view.picker.from.selectedId).toBe('card');
    expect(view.picker.to.title).toBe('Получаю на счёт');
    expect(view.picker.to.accounts).toEqual([
      { id: 'cash', name: 'Наличные', balance: sum('1 250 000 сум') },
      { id: 'usd', name: 'Доллары', balance: sum('420,00 USD') },
    ]);
    expect(transferView(start(), BOARD).picker.to.title).toBe('Куда');
  });

  it('needs two visible accounts; an account the link names but the list has not falls back to the card', () => {
    expect(startTransfer([CARD], undefined)).toBeNull();
    expect(startTransfer(BOARD.accounts, 'gone')?.fromId).toBe('card');
    expect(startTransfer([CASH, USD], undefined)).toMatchObject({ fromId: 'cash', toId: 'usd' });
  });
});
