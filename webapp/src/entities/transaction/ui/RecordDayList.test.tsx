// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MINUS, NBSP } from '@/shared/lib/money';
import type { Transaction } from '@/shared/types';
import { buildRecordDays } from '../lib/recordDays';
import { RecordDayList } from './RecordDayList';

/**
 * FT-115, TransactionList.md: a row is two buttons — the category circle opens the choice of a category at
 * once, the rest of the row opens the record's sheet — and the row just changed is ringed for 2 seconds.
 */

const TODAY = '2026-10-14';

const RECORDS: Transaction[] = [
  { id: 't1', type: 'expense', amount: 186400, amountMinor: 18_640_000, currency: 'UZS', category: 'Продукты', categoryColor: 'peach', date: TODAY, description: 'Супермаркет', userId: 'u1' },
  { id: 't2', type: 'expense', amount: 24000, amountMinor: 2_400_000, currency: 'UZS', category: 'Транспорт', categoryColor: 'sky', date: TODAY, description: 'Такси', userId: 'u1' },
];

const DAYS = buildRecordDays(RECORDS, { today: TODAY, categoryOf: () => undefined });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) => {
  const found = [...container.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === label);
  if (!found) throw new Error(`No button «${label}»`);
  return found;
};

describe('a row of the list', () => {
  it('the category circle opens the choice of a category, the rest of the row the record', () => {
    const onOpen = vi.fn();
    const onCategory = vi.fn();
    act(() => root.render(<RecordDayList days={DAYS} onOpen={onOpen} onCategory={onCategory} />));

    act(() => button(`Сменить категорию: Продукты, ${MINUS}186${NBSP}400${NBSP}сум`).click());
    expect(onCategory).toHaveBeenCalledWith('t1');
    expect(onOpen).not.toHaveBeenCalled();

    act(() => button(`Продукты, ${MINUS}186${NBSP}400${NBSP}сум, Супермаркет. Открыть`).click());
    expect(onOpen).toHaveBeenCalledWith('t1');
  });

  it('the circle is a 52×60 target of its own', () => {
    act(() => root.render(<RecordDayList days={DAYS} onOpen={() => {}} onCategory={() => {}} />));

    expect(button(`Сменить категорию: Транспорт, ${MINUS}24${NBSP}000${NBSP}сум`).className).toMatch(/w-\[52px\].*h-row|h-row.*w-\[52px\]/);
  });

  it('the row just changed is ringed inside with ink, the others are not', () => {
    act(() => root.render(<RecordDayList days={DAYS} onOpen={() => {}} onCategory={() => {}} flashId="t2" />));

    const rows = [...container.querySelectorAll('li')];
    expect(rows[1].className).toMatch(/ring-2/);
    expect(rows[1].className).toMatch(/ring-inset/);
    expect(rows[1].className).toMatch(/ring-ink/);
    expect(rows[0].className).not.toMatch(/ring-2/);
  });
});
