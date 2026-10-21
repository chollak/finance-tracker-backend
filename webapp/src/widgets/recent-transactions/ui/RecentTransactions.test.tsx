// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Category } from '@/entities/category';
import { queueRecords } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { toLocalDate } from '@/shared/lib/dates';
import { cancelInOutbox, memoryOfflineStorage, setOfflineStorage, useOutboxStore } from '@/shared/lib/offline';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import type { Transaction } from '@/shared/types';
import { RecentTransactions } from './RecentTransactions';

/**
 * FT-129, board «Главная без связи» and OfflineBar.md: a record written without a connection is among the recent ones
 * at once — first on its day, its amount and colour as any other — with «Ждёт связи» and a clock first in its caption.
 * It is not on the server yet, so it has no sheet; a tap says so.
 */

const USER_ID = '900000001';
const TODAY = toLocalDate(new Date());

const CATEGORIES: Category[] = [
  { id: 'c-cafe', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'cafe' },
  { id: 'c-gro', type: 'expense', name: 'Продукты', color: 'peach', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'groceries' },
];

const SERVER: Transaction[] = [
  {
    id: 't1', date: TODAY, category: 'Продукты', categoryId: 'c-gro', description: 'Супермаркет', amount: 186_400,
    amountMinor: 18_640_000, currency: 'UZS', type: 'expense', userId: USER_ID,
  },
];

const opened = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock('@/entities/transaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/transaction')>();
  return { ...actual, useRecentRecords: () => ({ data: SERVER, isError: false, isFetching: false, refetch: vi.fn() }) };
});
vi.mock('@/entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/category')>();
  return { ...actual, useCategories: () => ({ data: CATEGORIES }) };
});
vi.mock('@/features/record-sheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/record-sheet')>();
  return {
    ...actual,
    openRecordSheet: (id: string) => opened.ids.push(id),
    openRecordCategory: (id: string) => opened.ids.push(id),
    useRecordFlash: () => null,
  };
});

let root: Root | null = null;
let container: HTMLDivElement;

async function render(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <RecentTransactions />
        </MemoryRouter>
      </QueryClientProvider>
    );
  });
}

/** Each row as its open button names it. */
const rowLabels = () => [...container.querySelectorAll('li')].map((row) => row.querySelectorAll('button')[1]?.getAttribute('aria-label'));
const shownToast = () => visibleEntry(useUndoToastStore.getState().stack, Date.now());

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  opened.ids = [];
  setOfflineStorage(memoryOfflineStorage());
  useOutboxStore.setState({ entries: [] });
  useUndoToastStore.getState().clear();
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('a record waiting for the connection on Home', () => {
  let clientId = '';
  beforeEach(() => {
    [{ clientId }] = queueRecords(USER_ID, [
      { type: 'expense', amountMinor: 2_500_000, currency: 'UZS', categoryId: 'c-cafe', categoryName: 'Кафе', date: TODAY, note: 'Кофе' },
    ]);
  });

  it('is first among the recent records, with «Ждёт связи» first in its caption', async () => {
    await render();

    expect(rowLabels()).toEqual(['Кафе, −25\u00a0000\u00a0сум, Кофе, ждёт связи', 'Продукты, −186\u00a0400\u00a0сум, Супермаркет. Открыть']);
    const caption = container.querySelector('li [data-pending]');
    expect(caption?.textContent).toBe('Ждёт связи · Кофе');
  });

  it('has the clock before its caption', async () => {
    await render();

    const caption = [...container.querySelectorAll('li')][0].querySelector('[data-pending]');
    expect(caption?.previousElementSibling?.tagName.toLowerCase()).toBe('svg');
  });

  it('a tap says it can be changed once it is sent, and opens no sheet', async () => {
    await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('li button[aria-label*="ждёт связи"]')!.click();
    });

    expect(opened.ids).toEqual([]);
    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Запись ждёт связи', detail: 'Изменить её можно, когда она отправится' });
  });

  it('is gone at once when «Отменить» takes it back while it is being sent', async () => {
    await render();

    await act(async () => {
      await cancelInOutbox([clientId]);
    });

    expect(container.querySelector('li [data-pending]')).toBeNull();
    expect(rowLabels()).toEqual(['Продукты, −186\u00a0400\u00a0сум, Супермаркет. Открыть']);
  });

  it('a record on the server still opens its sheet', async () => {
    await render();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('li button[aria-label^="Продукты"]')!.click();
    });

    expect(opened.ids).toEqual(['t1']);
  });
});

describe('several records of one phrase written without a connection', () => {
  it('keep the order the phrase named them in: «такси 18к, кофе 25к» — Такси, then Кофе', async () => {
    queueRecords(USER_ID, [
      { type: 'expense', amountMinor: 1_800_000, currency: 'UZS', categoryName: 'Транспорт', date: TODAY, note: 'Такси' },
      { type: 'expense', amountMinor: 2_500_000, currency: 'UZS', categoryId: 'c-cafe', categoryName: 'Кафе', date: TODAY, note: 'Кофе' },
    ]);

    await render();

    expect([...container.querySelectorAll('li [data-pending]')].map((caption) => caption.textContent)).toEqual([
      'Ждёт связи · Такси',
      'Ждёт связи · Кофе',
    ]);
  });
});

describe('a waiting record with an amount to check', () => {
  it('says «проверьте сумму» right after «Ждёт связи»', async () => {
    queueRecords(USER_ID, [
      { type: 'expense', amountMinor: 4_500_000, currency: 'UZS', categoryId: 'c-cafe', categoryName: 'Кафе', date: TODAY, note: 'Обед', checkAmount: true },
    ]);

    await render();

    const caption = container.querySelector('li [data-pending]');
    expect(caption?.textContent).toBe('Ждёт связи · проверьте сумму · Обед');
    // Two lines rather than an ellipsis that cuts the flag
    expect(caption?.className).toContain('line-clamp-2');
    expect(caption?.className).not.toContain('truncate');
  });

  it('a plain waiting record keeps its caption on one line, as the board draws it', async () => {
    queueRecords(USER_ID, [
      { type: 'expense', amountMinor: 2_500_000, currency: 'UZS', categoryId: 'c-cafe', categoryName: 'Кафе', date: TODAY, note: 'Кофе' },
    ]);

    await render();

    expect(container.querySelector('li [data-pending]')?.className).toContain('truncate');
  });
});
