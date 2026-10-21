import { describe, expect, it } from 'vitest';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { MINUS, NBSP } from '@/shared/lib/money';
import { accountFilterChips, categoryFilterGroups, EMPTY_HISTORY, nothingFoundText, NOTHING_FOUND_TITLE, resultLine, TYPE_FILTER, typeChipLabel } from './historyFilters';

/**
 * FT-116, FilterChips.md and EmptyState.md: the line under the chips says what a search found, the empty
 * result says what was searched, and the category filter offers every category of both kinds.
 */

describe('what a search found', () => {
  it('counts the records and sums them up in сум (board «История · «такси» + Наличные»)', () => {
    expect(resultLine({ count: 2, netMinor: -10_900_000, usd: { present: false, missingRate: false } })).toBe(
      `2 операции · ${MINUS}109${NBSP}000${NBSP}сум`
    );
    expect(resultLine({ count: 1, netMinor: 1_250_000_000, usd: { present: false, missingRate: false } })).toBe(
      `1 операция · +12${NBSP}500${NBSP}000${NBSP}сум`
    );
    expect(resultLine({ count: 25, netMinor: 1_611_800_000, usd: { present: true, missingRate: false } })).toBe(
      `25 операций · ≈${NBSP}+16${NBSP}118${NBSP}000${NBSP}сум`
    );
  });

  it('does not sum dollars it has no rate for', () => {
    expect(resultLine({ count: 3, netMinor: -10_900_000, usd: { present: true, missingRate: true } })).toBe('3 операции');
  });
});

describe('when nothing is found (EmptyState.md)', () => {
  it('names what was searched (board «История · ничего не найдено»)', () => {
    expect(NOTHING_FOUND_TITLE).toBe('Ничего не нашлось');
    expect(nothingFoundText({ text: 'такси', category: null, account: 'Доллары' })).toBe(
      'Ничего нет по запросу «такси», на счёте «Доллары». Попробуйте другое слово или снимите фильтр.'
    );
    expect(nothingFoundText({ text: '  кофе ', category: 'Кафе', account: null })).toBe(
      'Ничего нет по запросу «кофе», в категории «Кафе». Попробуйте другое слово или снимите фильтр.'
    );
    expect(nothingFoundText({ text: '', category: 'Кафе', account: 'Карта' })).toBe(
      'Ничего нет в категории «Кафе», на счёте «Карта». Попробуйте другое слово или снимите фильтр.'
    );
  });

  it('names the type chosen', () => {
    expect(nothingFoundText({ text: 'такси', category: null, account: null, type: 'income' })).toBe(
      'Ничего нет по запросу «такси», среди доходов. Попробуйте другое слово или снимите фильтр.'
    );
    expect(nothingFoundText({ text: '', category: null, account: 'Карта', type: 'expense' })).toBe(
      'Ничего нет на счёте «Карта», среди расходов. Попробуйте другое слово или снимите фильтр.'
    );
  });

  it('an empty history leads to the first record instead', () => {
    expect(EMPTY_HISTORY).toEqual({ title: 'Пока нет операций', text: 'Запишите первую трату на главной — она появится здесь.' });
  });
});

describe('the category filter (Picker.md: «Все категории», then «Расходы» and «Доходы»)', () => {
  const category = (overrides: Partial<Category>): Category => ({
    id: 'c', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 10, presetKey: null, ...overrides,
  });

  it('groups the visible categories by kind, «Другое» last; an empty kind is left out', () => {
    const groups = categoryFilterGroups([
      category({ id: 'other', name: 'Другое', color: 'mist', isOther: true, sortOrder: 1 }),
      category({ id: 'cafe', name: 'Кафе', sortOrder: 20 }),
      category({ id: 'food', name: 'Продукты', color: 'peach', sortOrder: 10 }),
      category({ id: 'gone', name: 'Старое', isHidden: true }),
      category({ id: 'salary', type: 'income', name: 'Зарплата', color: 'mint' }),
    ]);

    expect(groups).toEqual([
      {
        label: 'Расходы',
        categories: [
          { id: 'food', name: 'Продукты', color: 'peach' },
          { id: 'cafe', name: 'Кафе', color: 'rose' },
          { id: 'other', name: 'Другое', color: 'mist' },
        ],
      },
      { label: 'Доходы', categories: [{ id: 'salary', name: 'Зарплата', color: 'mint' }] },
    ]);
    expect(categoryFilterGroups([category({ id: 'cafe' })]).map((group) => group.label)).toEqual(['Расходы']);
  });
});

describe('the type filter (Definition of Done: «чипы фильтров (категория, счёт, тип) через Picker»)', () => {
  it('offers both kinds, only expenses, only income', () => {
    expect(TYPE_FILTER.title).toBe('Тип операции');
    expect(TYPE_FILTER.options.map((option) => [option.name, option.type])).toEqual([
      ['Все', null],
      ['Расходы', 'expense'],
      ['Доходы', 'income'],
    ]);
  });

  it('the chip says «Тип» while both are shown, and the kind once one is chosen', () => {
    expect(typeChipLabel(null)).toBe('Тип');
    expect(typeChipLabel('expense')).toBe('Расходы');
    expect(typeChipLabel('income')).toBe('Доходы');
  });
});

describe('the account chips (FT-118)', () => {
  const account = (id: string, isHidden = false): Account => ({
    id, name: id, kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden, sortOrder: 10, balanceMinor: 0,
  });
  const ALL = [account('cash'), account('old', true), account('card')];

  it('offers the visible accounts in their order', () => {
    expect(accountFilterChips(ALL, null).map((chip) => chip.id)).toEqual(['cash', 'card']);
    expect(accountFilterChips(ALL, 'card').map((chip) => chip.id)).toEqual(['cash', 'card']);
    expect(accountFilterChips(undefined, 'card')).toEqual([]);
  });

  it('keeps a hidden account History is narrowed by at the end, so its chip can be let go', () => {
    expect(accountFilterChips(ALL, 'old').map((chip) => chip.id)).toEqual(['cash', 'card', 'old']);
    expect(accountFilterChips(ALL, 'gone').map((chip) => chip.id)).toEqual(['cash', 'card']);
  });
});
