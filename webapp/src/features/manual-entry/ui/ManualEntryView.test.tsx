import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { MINUS, NBSP, type KeypadKey } from '@/shared/lib/money';
import { ROUTES } from '@/shared/lib/constants/routes';
import {
  chooseAccount,
  chooseCategory,
  initialManualEntry,
  manualEntryModel,
  pressEntryKey,
  type EntryContext,
  type ManualEntryState,
} from '../model/manualEntry';
import { ManualEntryView, type ManualEntryViewProps } from './ManualEntryView';

/**
 * FT-113, boards «Ручной ввод» and «Ручной ввод · тёмная», rendered to static markup (no DOM): what the
 * screen shows and offers to press for a given state.
 */

const TODAY = '2026-10-14';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-10-01',
    isHidden: false, sortOrder: 20, balanceMinor: 0, ...overrides,
  };
}

const ACCOUNTS = [
  account({ id: 'cash', name: 'Наличные', kind: 'cash', balanceMinor: 125_000_000 }),
  account({ id: 'card', name: 'Карта', balanceMinor: 318_000_000 }),
  account({ id: 'usd', name: 'Доллары', kind: 'cash', currency: 'USD', balanceMinor: 42_000 }),
];

const NAMES: Array<[string, string, Category['color']]> = [
  ['pr', 'Продукты', 'peach'], ['kf', 'Кафе', 'rose'], ['tr', 'Транспорт', 'sky'], ['dm', 'Дом', 'sand'],
  ['sv', 'Связь', 'lilac'], ['zd', 'Здоровье', 'mint'], ['pk', 'Покупки', 'butter'], ['dr', 'Другое', 'mist'],
];
const CATEGORIES: Category[] = NAMES.map(([id, name, color], index) => ({
  id, type: 'expense', name, color, isHidden: false, isOther: name === 'Другое', sortOrder: (index + 1) * 10, presetKey: null,
}));

const CONTEXT: EntryContext = { accounts: ACCOUNTS, categories: CATEGORIES, rateMinor: 1_265_000, today: TODAY };

const typed = (keys: KeypadKey[], state: ManualEntryState) => keys.reduce((s, key) => pressEntryKey(s, key, ACCOUNTS), state);
const BOARD = chooseCategory(typed(['1', '8', '6', '4', '0', '0'], initialManualEntry(TODAY, 'card')), 'pr');

function render(state: ManualEntryState, overrides: Partial<ManualEntryViewProps> = {}): string {
  const noop = () => {};
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[ROUTES.MANUAL_ENTRY]}>
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
        onNote={noop}
        onOpenDate={noop}
        onSave={noop}
        onRetry={noop}
        {...overrides}
      />
    </MemoryRouter>
  );
}

// Collapses markup and ordinary spaces; keeps the non-breaking ones money is grouped with
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ');
const tags = (html: string, pattern: RegExp) => [...html.matchAll(pattern)].map((match) => match[0]);
const buttonWith = (html: string, label: string) =>
  tags(html, /<button[^>]*>(?:(?!<\/button>).)*<\/button>/gs).find((tag) => text(tag).includes(label));

/** The element that opens at `start` in the markup, through its matching closing tag. */
function elementFrom(html: string, start: number): string {
  const name = /^<(\w+)/.exec(html.slice(start))?.[1] ?? 'div';
  const pattern = new RegExp(`<${name}[\\s>]|</${name}>`, 'g');
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  return html.slice(start);
}

describe('header', () => {
  it('has «Назад», «Расход / Доход» with the type pressed, and the date', () => {
    const html = render(BOARD);

    expect(html).toMatch(/<button[^>]*aria-label="Назад"/);
    expect(html).toMatch(/role="group" aria-label="Тип операции"/);
    expect(buttonWith(html, 'Расход')).toMatch(/aria-pressed="true"/);
    expect(buttonWith(html, 'Доход')).toMatch(/aria-pressed="false"/);
    expect(buttonWith(html, 'Сегодня')).toMatch(/aria-label="Дата: сегодня, 14 октября"/);
  });
});

describe('amount', () => {
  it('shows the typed amount with its sign and unit, and the dollar equivalent', () => {
    const html = render(BOARD);

    expect(html).toMatch(/<h1[^>]*>Сумма<\/h1>/);
    expect(text(html)).toContain(`${MINUS}186${NBSP}400 сум`);
    expect(text(html)).toContain(`≈ 14,74${NBSP}USD`);
  });

  it('is a muted 0 before anything is typed', () => {
    const html = render(initialManualEntry(TODAY, 'card'));

    expect(html).toMatch(/<span[^>]*text-ink-muted[^>]*>0<\/span>/);
  });
});

describe('account', () => {
  it('offers every visible account with its balance; the chosen one is checked', () => {
    const html = render(BOARD);
    const radios = tags(html, /<button[^>]*role="radio"[^>]*>(?:(?!<\/button>).)*<\/button>/gs);
    const accounts = radios.filter((tag) => /Наличные|Карта|Доллары/.test(tag));

    expect(accounts.map((tag) => text(tag).trim())).toEqual([
      `Наличные 1${NBSP}250${NBSP}000${NBSP}сум`,
      `Карта 3${NBSP}180${NBSP}000${NBSP}сум`,
      `Доллары 420,00${NBSP}USD`,
    ]);
    expect(accounts.map((tag) => /aria-checked="true"/.test(tag))).toEqual([false, true, false]);
  });
});

describe('category tiles', () => {
  it('are eight radios of the expense set, the chosen one checked', () => {
    const html = render(BOARD);
    const group = html.match(/<div[^>]*role="radiogroup"[^>]*aria-label="Категория расхода"[^>]*>.*?<\/div>/s)?.[0] ?? '';
    const tiles = tags(group, /<button[^>]*role="radio"[^>]*>.*?<\/button>/gs);

    expect(tiles.map((tag) => text(tag).trim())).toEqual(NAMES.map(([, name]) => name));
    expect(tiles.filter((tag) => /aria-checked="true"/.test(tag)).map((tag) => text(tag).trim())).toEqual(['Продукты']);
  });
});

describe('note', () => {
  it('is an optional text field with an example', () => {
    const html = render(BOARD);

    expect(html).toMatch(/<label[^>]*>.*Заметка.*<input[^>]*placeholder="Например, супермаркет"/s);
  });
});

describe('keypad and the main button', () => {
  it('сум get «000»; a dollar account gets a comma', () => {
    expect(render(BOARD)).toMatch(/aria-label="Три нуля"/);

    const dollars = chooseAccount(BOARD, 'usd', ACCOUNTS);
    const html = render(dollars);
    expect(html).toMatch(/aria-label="Запятая"/);
    expect(html).not.toMatch(/aria-label="Три нуля"/);
  });

  it('one main button: «Сохранить расход» when ready, otherwise what is missing, disabled', () => {
    expect(buttonWith(render(BOARD), 'Сохранить расход')).not.toMatch(/disabled=""/);
    expect(buttonWith(render(initialManualEntry(TODAY, 'card')), 'Введите сумму')).toMatch(/disabled=""/);
  });

  it('waits while saving instead of saving twice', () => {
    expect(buttonWith(render(BOARD, { saving: true }), 'Сохранить расход')).toMatch(/disabled=""[^>]*aria-busy="true"|aria-busy="true"[^>]*disabled=""/);
  });

  it('says so when the save failed, keeping what was entered', () => {
    const html = render(BOARD, { saveFailed: true });

    expect(html).toMatch(/role="alert"[^>]*>Не получилось сохранить\. Проверьте связь и нажмите ещё раз\./);
    expect(text(html)).toContain(`${MINUS}186${NBSP}400 сум`);
  });
});

describe('while the lists are read or could not be read', () => {
  it('loading shows the shapes of the tiles, not tiles to press', () => {
    const html = render(BOARD, { accounts: 'loading', categories: 'loading' });

    expect(html).not.toMatch(/role="radio"/);
    expect(html).toMatch(/aria-busy="true"/);
  });

  it('a failed read says what is missing and offers to read again', () => {
    const html = render(BOARD, { categories: 'failed' });

    expect(text(html)).toContain('Не получилось загрузить категории');
    expect(buttonWith(html, 'Попробовать снова')).toBeDefined();
  });
});

describe('more categories and accounts than the board has (users add their own)', () => {
  const MORE_CATEGORIES: Category[] = [
    ...CATEGORIES,
    ...['Спорт', 'Кофе с собой', 'Подарки', 'Дети'].map((name, index): Category => ({
      id: `own-${index}`, type: 'expense', name, color: 'mint', isHidden: false, isOther: false, sortOrder: 100 + index * 10, presetKey: null,
    })),
  ];
  const MORE_ACCOUNTS = [...ACCOUNTS, account({ id: 'savings', name: 'Копилка', sortOrder: 40 })];

  it('only the lists scroll: the amount, the keypad and the main button stay on the one screen', () => {
    const html = render(BOARD, { model: manualEntryModel(BOARD, { ...CONTEXT, accounts: MORE_ACCOUNTS, categories: MORE_CATEGORIES }) });
    const lists = elementFrom(html, html.search(/<div class="[^"]*\boverflow-y-auto\b/));

    // The screen is exactly one viewport tall instead of growing past it
    expect(html).toMatch(/^<div class="[^"]*\bh-\[calc\(100dvh-env\(safe-area-inset-bottom\)\)\]/);
    expect(html).not.toMatch(/min-h-dvh/);

    expect(lists).toMatch(/aria-label="Счёт"/);
    expect(lists).toMatch(/aria-label="Категория расхода"/);
    expect(tags(lists, /role="radio"/g)).toHaveLength(MORE_ACCOUNTS.length + MORE_CATEGORIES.length);
    expect(lists).toContain('Заметка');

    expect(lists).not.toMatch(/aria-label="Сумма"/);
    expect(lists).not.toMatch(/aria-label="Три нуля"/);
    expect(text(lists)).not.toContain('Сохранить расход');
  });
});
