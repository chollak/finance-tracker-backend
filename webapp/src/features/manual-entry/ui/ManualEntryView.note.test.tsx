// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { ROUTES } from '@/shared/lib/constants/routes';
import type { KeypadKey } from '@/shared/lib/money';
import {
  changeNote,
  chooseCategory,
  initialManualEntry,
  manualEntryModel,
  pressEntryKey,
  type EntryContext,
  type ManualEntryState,
} from '../model/manualEntry';
import { ManualEntryView } from './ManualEntryView';

/**
 * FT-147: the note while it is typed. The phone's keyboard covers the bottom of the screen — in Telegram's
 * WebView unpredictably — so while the note has focus the screen keeps only the header, the amount and the
 * note at the top, with «Готово» next to it: the keypad, the main button and the lists leave until the note
 * is done. Rendered in jsdom.
 */

const TODAY = '2026-10-14';

const ACCOUNTS: Account[] = [
  { id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false, sortOrder: 20, balanceMinor: 318_000_000 },
];

const CATEGORIES: Category[] = [
  { id: 'pr', type: 'expense', name: 'Продукты', color: 'peach', isHidden: false, isOther: false, sortOrder: 10, presetKey: null },
  { id: 'dr', type: 'expense', name: 'Другое', color: 'mist', isHidden: false, isOther: true, sortOrder: 20, presetKey: null },
];

const CONTEXT: EntryContext = { accounts: ACCOUNTS, categories: CATEGORIES, rateMinor: 1_265_000, today: TODAY };

const typed = (keys: KeypadKey[], state: ManualEntryState) => keys.reduce((s, key) => pressEntryKey(s, key, ACCOUNTS), state);
const START = chooseCategory(typed(['1', '8', '6', '4', '0', '0'], initialManualEntry(TODAY, 'card')), 'pr');

/** The screen with its note kept as `ManualEntry` keeps it. */
function Screen() {
  const [state, setState] = useState(START);
  const noop = () => {};
  return (
    <ManualEntryView
      type={state.type}
      note={state.note}
      model={manualEntryModel(state, CONTEXT)}
      accounts="ready"
      categories="ready"
      onType={noop}
      onAccount={noop}
      onCategory={noop}
      onKey={noop}
      onNote={(note) => setState((current) => changeNote(current, note))}
      onOpenDate={noop}
      onSave={noop}
      onRetry={noop}
    />
  );
}

let root: Root | null = null;
let container: HTMLDivElement;

async function renderScreen(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[ROUTES.MANUAL_ENTRY]}>
        <Screen />
      </MemoryRouter>
    );
  });
}

const note = () => container.querySelector<HTMLInputElement>('input[placeholder="Например, супермаркет"]')!;
const done = () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Готово');
const keypad = () => container.querySelector('[aria-label="Цифровая клавиатура"]');
const saveButton = () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Сохранить расход');
const accountList = () => container.querySelector('[role="radiogroup"][aria-label="Счёт"]');
const categoryList = () => container.querySelector('[role="radiogroup"][aria-label="Категория расхода"]');
const header = () => container.querySelector('[aria-label="Тип операции"]');
const amount = () => container.querySelector('section[aria-label="Сумма"]');

async function focusNote(): Promise<void> {
  await act(async () => note().focus());
}

async function type(value: string): Promise<void> {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(note(), value);
    note().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The whole board is on the screen: lists, keypad and the main button, and no «Готово» of the note. */
function expectBoard(): void {
  expect(keypad()).not.toBeNull();
  expect(saveButton()).toBeDefined();
  expect(accountList()).not.toBeNull();
  expect(categoryList()).not.toBeNull();
  expect(done()).toBeUndefined();
  expect(note().closest('label')?.querySelector('span')?.className).not.toMatch(/\bsr-only\b/);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('the note while it is typed (FT-147)', () => {
  it('before the note: the lists, the keypad and the main button, as on the board', async () => {
    await renderScreen();

    expectBoard();
  });

  it('focus on the note: the keypad, the main button and the lists leave; the header, the amount and the note stay, with «Готово»', async () => {
    await renderScreen();
    const field = note();
    await focusNote();

    expect(keypad()).toBeNull();
    expect(saveButton()).toBeUndefined();
    expect(accountList()).toBeNull();
    expect(categoryList()).toBeNull();

    expect(header()).not.toBeNull();
    expect(amount()).not.toBeNull();
    expect(done()).toBeDefined();
    // «Заметка» still names the field, for screen readers only: next to «Готово» the example needs the room
    expect(field.closest('label')?.textContent).toBe('Заметка');
    expect(field.closest('label')?.querySelector('span')?.className).toMatch(/\bsr-only\b/);
    // The same field keeps the focus: the phone's keyboard stays open while the screen changes around it
    expect(note()).toBe(field);
    expect(document.activeElement).toBe(field);
  });

  it('«Готово» ends the note: the screen comes back and the note keeps its text', async () => {
    await renderScreen();
    await focusNote();
    await type('Супермаркет');

    await act(async () => done()!.click());

    expect(document.activeElement).not.toBe(note());
    expectBoard();
    expect(note().value).toBe('Супермаркет');
  });

  it('«Готово» does not take the focus from the note before its press (the screen would change under the finger)', async () => {
    await renderScreen();
    await focusNote();

    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    await act(async () => {
      done()!.dispatchEvent(press);
    });

    expect(press.defaultPrevented).toBe(true);
  });

  it('Enter — «Готово» on the phone keyboard — ends it the same way', async () => {
    await renderScreen();
    await focusNote();
    await type('Обед');

    await act(async () => {
      note().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(document.activeElement).not.toBe(note());
    expectBoard();
    expect(note().value).toBe('Обед');
  });

  it.each([
    ['while composing', { isComposing: true }],
    // Safari ends the composition before the keydown, which then says so only by keyCode 229
    ['in Safari, after the composition ended', { keyCode: 229 }],
  ])('Enter that confirms a word of an input method keeps the note open (%s)', async (_, init) => {
    await renderScreen();
    await focusNote();

    await act(async () => {
      note().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }));
    });

    expect(document.activeElement).toBe(note());
    expect(keypad()).toBeNull();
  });

  it('the focus leaving the note brings the screen back', async () => {
    await renderScreen();
    await focusNote();

    await act(async () => note().blur());

    expectBoard();
  });

  it('Tab from the note to «Готово» keeps the note open, so «Готово» can be pressed from a computer keyboard', async () => {
    await renderScreen();
    await focusNote();
    const button = done()!;

    // A browser renders between the field's blur and the button's focus: in one `act` they would merge and a
    // screen that closed on the blur would open again on the focus unseen
    await act(async () => {
      note().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button }));
    });
    expect(keypad()).toBeNull();
    expect(done()).toBe(button);

    await act(async () => button.focus());
    expect(keypad()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  /**
   * A low screen: the lists' box ends at 350px and the note row, once the lists are back, stands at 400–448px,
   * below it. Returns what the box was scrolled to, or null when it was not scrolled.
   */
  function lowScreen(): () => number | null {
    const lists = note().closest<HTMLElement>('.overflow-y-auto')!;
    const row = note().closest('label')!.parentElement!;
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top }) as DOMRect;
    lists.getBoundingClientRect = () => rect(200, 350);
    row.getBoundingClientRect = () => rect(400, 448);
    let scrolledTo: number | null = null;
    Object.defineProperty(lists, 'scrollTop', {
      configurable: true,
      get: () => scrolledTo ?? 0,
      set: (value: number) => {
        scrolledTo = value;
      },
    });
    return () => scrolledTo;
  }

  it('after «Готово» the lists show the note with the least scroll: its bottom at the box bottom', async () => {
    await renderScreen();
    await focusNote();
    const scrolled = lowScreen();

    await act(async () => done()!.click());

    expect(scrolled()).toBe(448 - 350);
  });

  it('after Enter too', async () => {
    await renderScreen();
    await focusNote();
    const scrolled = lowScreen();

    await act(async () => {
      note().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(scrolled()).toBe(448 - 350);
  });

  it('leaving the note for another control (the date) keeps the lists at their top: the next step is there', async () => {
    await renderScreen();
    await focusNote();
    const scrolled = lowScreen();
    const date = container.querySelector<HTMLButtonElement>('button[aria-label^="Дата"]')!;

    await act(async () => date.focus());

    expectBoard();
    expect(scrolled()).toBeNull();
  });
});
