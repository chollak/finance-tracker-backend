import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import { MINUS, NBSP, emptyKeypad, pressKey, type Currency, type KeypadKey, type KeypadState } from '@/shared/lib/money';
import {
  NEW_ACCOUNT,
  accountWriteError,
  correctBalanceView,
  editAccountDraft,
  editAccountView,
  newAccountView,
} from './accountForms';

/**
 * FT-118, boards «Новый счёт», «Изменить или скрыть счёт», «Сверить остаток» (design-system «Счета и курс»):
 * a new account with its balance now (not income), rename, hide (never the last visible one), a currency changed
 * only without operations with the balance entered again, and the true balance recorded as an adjustment — the
 * button stays off for an empty field and for the balance Daftar already has.
 */

const TODAY = '2026-10-14';

const CARD: Account & { hasOperations: boolean } = {
  id: 'card',
  name: 'Карта',
  kind: 'card',
  currency: 'UZS',
  openingBalanceMinor: 200_000_000,
  openingDate: '2026-08-01',
  isHidden: false,
  sortOrder: 20,
  balanceMinor: 318_000_000,
  hasOperations: true,
};

function typed(keys: KeypadKey[], currency: Currency = 'UZS', from: KeypadState = emptyKeypad()): KeypadState {
  return keys.reduce((state, key) => pressKey(state, key, currency), from);
}

describe('new account', () => {
  it('asks for a name first; then adds the account with its balance now as the opening balance', () => {
    expect(newAccountView(NEW_ACCOUNT)).toMatchObject({
      amount: { text: '0', placeholder: true, unit: 'сум' },
      button: { label: 'Введите название', ready: false },
      payload: null,
    });

    const draft = { ...NEW_ACCOUNT, name: '  Копилка ', amount: typed(['5', '0', '0', '000']) };
    expect(newAccountView(draft)).toEqual({
      amount: { text: `500${NBSP}000`, placeholder: false, unit: 'сум' },
      button: { label: 'Добавить счёт', ready: true },
      payload: { name: 'Копилка', kind: 'cash', currency: 'UZS', openingBalanceMinor: 50_000_000 },
      saved: { title: 'Счёт добавлен', detail: `Копилка · 500${NBSP}000${NBSP}сум` },
    });
  });

  it('a dollar account takes cents; an empty amount is a zero balance', () => {
    const dollars = newAccountView({ ...NEW_ACCOUNT, name: 'Заначка', kind: 'card', currency: 'USD', amount: typed(['2', '0', ',', '5'], 'USD') });
    expect(dollars.amount).toEqual({ text: '20,5', placeholder: false, unit: 'USD' });
    expect(dollars.payload).toEqual({ name: 'Заначка', kind: 'card', currency: 'USD', openingBalanceMinor: 2_050 });
    expect(newAccountView({ ...NEW_ACCOUNT, name: 'Копилка' }).payload).toMatchObject({ openingBalanceMinor: 0 });
  });
});

describe('edit account', () => {
  const context = { today: TODAY, visibleCount: 3, rateMinor: 1_265_000 };

  it('an account with operations keeps its currency and shows its opening balance', () => {
    const view = editAccountView(CARD, editAccountDraft(CARD), context);

    expect(view).toMatchObject({
      title: 'Счёт «Карта»',
      currency: { locked: true, text: 'Сумы', changed: false },
      initialText: `2${NBSP}000${NBSP}000${NBSP}сум · на 1 августа`,
      amount: null,
      button: { label: 'Сохранить', ready: true },
      change: null,
      hide: {
        action: 'hide',
        available: true,
        note: `Итог уменьшится на 3${NBSP}180${NBSP}000${NBSP}сум. Операции останутся в истории, вернуть счёт можно в любой момент.`,
      },
    });
  });

  it('a rename is saved with «Отменить» that puts the old name back', () => {
    const view = editAccountView(CARD, { ...editAccountDraft(CARD), name: 'Uzcard ' }, context);

    expect(view.change).toEqual({ patch: { name: 'Uzcard' }, undo: { name: 'Карта' }, detail: 'Карта → Uzcard' });
    expect(editAccountView(CARD, { ...editAccountDraft(CARD), name: '  ' }, context).button).toEqual({ label: 'Введите название', ready: false });
  });

  it('without operations the currency can change, and the balance is entered again in it', () => {
    const fresh = { ...CARD, name: 'Копилка', openingDate: TODAY, openingBalanceMinor: 50_000_000, balanceMinor: 50_000_000, hasOperations: false };
    const switched = { ...editAccountDraft(fresh), currency: 'USD' as const };

    expect(editAccountView(fresh, editAccountDraft(fresh), context)).toMatchObject({
      currency: { locked: false, changed: false },
      initialText: `500${NBSP}000${NBSP}сум · сегодня`,
    });
    expect(editAccountView(fresh, switched, context)).toMatchObject({
      currency: { locked: false, changed: true },
      initialText: null,
      amount: { text: '0', placeholder: true, unit: 'USD' },
      amountNote: 'Валюта меняется — введите остаток в новой валюте.',
      hide: null,
      change: {
        patch: { currency: 'USD', openingBalanceMinor: 0 },
        undo: { currency: 'UZS', openingBalanceMinor: 50_000_000 },
        detail: 'Копилка · сумы → доллары',
      },
    });
    expect(editAccountView(fresh, { ...switched, amount: typed(['4', '0'], 'USD') }, context).change?.patch).toEqual({
      currency: 'USD',
      openingBalanceMinor: 4_000,
    });
  });

  it('the last visible account cannot be hidden; a hidden one is shown again', () => {
    expect(editAccountView(CARD, editAccountDraft(CARD), { ...context, visibleCount: 1 }).hide).toEqual({
      action: 'hide',
      available: false,
      note: 'Это единственный видимый счёт — скрыть его нельзя.',
    });
    expect(editAccountView({ ...CARD, isHidden: true }, editAccountDraft(CARD), context).hide).toEqual({
      action: 'show',
      available: true,
      note: 'Счёт снова войдёт в итог и в выбор при записи.',
    });
  });

  it('hiding a dollar account names how much in сум leaves the total', () => {
    const usd = { ...CARD, name: 'Доллары', currency: 'USD' as const, balanceMinor: 42_000 };
    expect(editAccountView(usd, editAccountDraft(usd), context).hide?.note).toBe(
      `Итог уменьшится на 5${NBSP}313${NBSP}000${NBSP}сум. Операции останутся в истории, вернуть счёт можно в любой момент.`
    );
    expect(editAccountView(usd, editAccountDraft(usd), { ...context, rateMinor: null }).hide?.note).toBe(
      'Операции останутся в истории, вернуть счёт можно в любой момент.'
    );
  });
});

describe('correct the balance', () => {
  it('shows the balance Daftar has as a hint and keeps the button off until another one is typed', () => {
    expect(correctBalanceView(CARD, emptyKeypad())).toEqual({
      title: 'Сколько сейчас на счёте «Карта»?',
      amount: { text: `3${NBSP}180${NBSP}000`, placeholder: true, unit: 'сум' },
      note: `Введите остаток, как в банке или в кошельке. Сейчас в Daftar — 3${NBSP}180${NBSP}000${NBSP}сум.`,
      button: { label: 'Сверить остаток', ready: false },
      balanceMinor: null,
      saved: null,
    });
  });

  it('the same balance is nothing to fix', () => {
    const same = correctBalanceView(CARD, typed(['3', '1', '8', '0', '000']));
    expect(same.note).toBe('Совпадает с Daftar — исправлять нечего.');
    expect(same.button.ready).toBe(false);
    expect(same.balanceMinor).toBeNull();
  });

  it('a difference is recorded as an adjustment, out of expenses and analytics', () => {
    const view = correctBalanceView(CARD, typed(['3', '2', '0', '0', '000']));
    expect(view.note).toBe(`Разница +20${NBSP}000${NBSP}сум запишется корректировкой — в расходы и аналитику не попадёт.`);
    expect(view.button).toEqual({ label: 'Сверить остаток', ready: true });
    expect(view.balanceMinor).toBe(320_000_000);
    expect(view.saved).toEqual({ title: 'Остаток сверен', detail: `Карта · корректировка +20${NBSP}000${NBSP}сум` });

    const less = correctBalanceView(CARD, typed(['3', '000', '000']));
    expect(less.note).toBe(`Разница ${MINUS}180${NBSP}000${NBSP}сум запишется корректировкой — в расходы и аналитику не попадёт.`);
  });

  it('a dollar account is corrected in dollars with cents', () => {
    const usd = { ...CARD, name: 'Доллары', currency: 'USD' as const, balanceMinor: 42_000 };
    expect(correctBalanceView(usd, emptyKeypad()).amount).toEqual({ text: '420,00', placeholder: true, unit: 'USD' });
    expect(correctBalanceView(usd, typed(['4', '1', '0', ',', '5'], 'USD')).balanceMinor).toBe(41_050);
  });
});

describe('what a failed save says', () => {
  it('a taken name, operations that lock the currency, no connection, anything else', () => {
    expect(accountWriteError({ statusCode: 409, serverMessage: 'Account «Копилка» already exists' })).toBe(
      'Счёт с таким названием уже есть — выберите другое'
    );
    expect(accountWriteError({ statusCode: 409, serverMessage: 'The currency of an account with operations cannot change' })).toBe(
      'Валюту не изменить: на счёте уже есть операции'
    );
    expect(accountWriteError({ statusCode: 0 })).toBe('Нет связи. Проверьте её и нажмите ещё раз');
    expect(accountWriteError({ statusCode: 500 })).toBe('Не получилось сохранить. Попробуйте ещё раз');
  });
});
