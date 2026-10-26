// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { deleteTransaction } from '@/entities/transaction';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { useUserStore } from '@/entities/user';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import { useCaptureStore } from '../model/captureStore';
import { reviewSessionFrom } from '../model/captureReview';
import type { CapturedTransaction } from '../model/types';
import { CaptureReview } from './CaptureReview';

/**
 * FT-114: the review screen in a router. Any way out but «Сохранить» — its own «Назад», «Изменить»,
 * Telegram's BackButton (a navigation back) — takes the records of the phrase back and returns the text to
 * Home's field; opened without a phrase (a reload) it shows Home. Rendered in jsdom: the blocker and the
 * redirect run in effects.
 */

vi.mock('@/entities/transaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/transaction')>();
  return { ...actual, deleteTransaction: vi.fn(), patchTransaction: vi.fn(), restoreTransaction: vi.fn() };
});

const CATEGORIES: Category[] = [
  { id: 'c-cafe', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'cafe' },
  { id: 'c-tr', type: 'expense', name: 'Транспорт', color: 'sky', isHidden: false, isOther: false, sortOrder: 30, presetKey: 'transport' },
];

const ACCOUNTS: Account[] = [
  { id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false, sortOrder: 10, balanceMinor: 0 },
];

vi.mock('@/entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/category')>();
  return { ...actual, useCategories: () => ({ data: CATEGORIES }) };
});
vi.mock('@/entities/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/account')>();
  return { ...actual, useAccounts: () => ({ data: { accounts: ACCOUNTS } }) };
});
vi.mock('@/entities/rate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/rate')>();
  return { ...actual, useUsdRate: () => ({ data: undefined }) };
});

const USER_ID = '900000001';
const TEXT = 'кофе 25к, такси 18к';

const record = (overrides: Partial<CapturedTransaction>): CapturedTransaction => ({
  id: 'x', amount: 25000, amountMinor: 2_500_000, currency: 'UZS', type: 'expense', semanticType: 'expense', category: 'Кафе',
  categoryId: 'c-cafe', accountId: 'card', date: '2026-10-14', needsReview: false, countsAsRealExpense: true, ...overrides,
});

function openReview(): void {
  useCaptureStore.setState({
    draft: '',
    review: reviewSessionFrom(
      {
        status: 'saved',
        text: TEXT,
        transactions: [
          record({ id: 'a', description: 'кофе' }),
          record({ id: 'b', amount: 18000, amountMinor: 1_800_000, category: 'Транспорт', categoryId: 'c-tr', description: 'такси' }),
        ],
        debts: [],
        ack: { title: '', summary: '', actions: [] },
        review: { reasons: [] },
      },
      CATEGORIES
    ),
  });
}

/** Home as far as this screen cares: what is in the composer's field. */
function HomeStub() {
  const draft = useCaptureStore((state) => state.draft);
  return <p data-testid="home">Главная: {draft}</p>;
}

let root: Root | null = null;
let container: HTMLDivElement;

/** The app at /review, opened from Home, as a press of «Отправить» leaves it. */
async function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: ROUTES.HOME, element: <HomeStub /> },
      { path: ROUTES.CAPTURE_REVIEW, element: <CaptureReview /> },
    ],
    { initialEntries: [ROUTES.HOME, { pathname: path, state: { from: ROUTES.HOME } }], initialIndex: 1 }
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  return router;
}

const button = (name: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name
  );
  if (!found) throw new Error(`No button «${name}»`);
  return found;
};

async function press(name: string): Promise<void> {
  await act(async () => {
    button(name).click();
  });
}

const deletedIds = () => vi.mocked(deleteTransaction).mock.calls.map(([, variables]) => variables.id);
const shownToast = () => visibleEntry(useUndoToastStore.getState().stack, Date.now());

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  vi.mocked(deleteTransaction).mockReset().mockResolvedValue(undefined);
  useUndoToastStore.getState().clear();
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  openReview();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('the review screen', () => {
  it('shows the records of the phrase', async () => {
    await renderAt(ROUTES.CAPTURE_REVIEW);

    expect(container.textContent).toContain(`«${TEXT}»`);
    expect(button('Сохранить 2 операции')).toBeDefined();
  });

  it('«Назад» takes the records back, returns the text to the field and shows Home', async () => {
    const router = await renderAt(ROUTES.CAPTURE_REVIEW);

    await press('Назад');

    expect(deletedIds()).toEqual(['a', 'b']);
    expect(router.state.location.pathname).toBe(ROUTES.HOME);
    expect(container.querySelector('[data-testid="home"]')?.textContent).toBe(`Главная: ${TEXT}`);
    expect(useCaptureStore.getState().review).toBeNull();
  });

  it('Telegram’s BackButton (a navigation back) does the same', async () => {
    const router = await renderAt(ROUTES.CAPTURE_REVIEW);

    await act(async () => {
      await router.navigate(-1);
    });

    expect(deletedIds()).toEqual(['a', 'b']);
    expect(router.state.location.pathname).toBe(ROUTES.HOME);
    expect(useCaptureStore.getState().draft).toBe(TEXT);
  });

  it('«Изменить» does the same', async () => {
    const router = await renderAt(ROUTES.CAPTURE_REVIEW);

    await press('Изменить');

    expect(deletedIds()).toEqual(['a', 'b']);
    expect(router.state.location.pathname).toBe(ROUTES.HOME);
    expect(container.querySelector('[data-testid="home"]')?.textContent).toBe(`Главная: ${TEXT}`);
  });

  it('when the records could not be taken back, the screen stays and says so', async () => {
    vi.mocked(deleteTransaction).mockRejectedValueOnce({ message: 'Network Error', statusCode: 0 });
    const router = await renderAt(ROUTES.CAPTURE_REVIEW);

    await press('Назад');

    expect(router.state.location.pathname).toBe(ROUTES.CAPTURE_REVIEW);
    expect(useCaptureStore.getState().review).not.toBeNull();
    expect(shownToast()).toMatchObject({ title: 'Не получилось отменить' });
  });

  it('«Сохранить» leaves to Home without taking anything back', async () => {
    const router = await renderAt(ROUTES.CAPTURE_REVIEW);

    await press('Сохранить 2 операции');

    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe(ROUTES.HOME);
    expect(useCaptureStore.getState()).toMatchObject({ draft: '', review: null });
    expect(shownToast()).toMatchObject({ title: 'Записано' });
  });

  it('opened without a phrase (a reload) shows Home, and the records stay', async () => {
    useCaptureStore.setState({ review: null });

    const router = await renderAt(ROUTES.CAPTURE_REVIEW);

    expect(router.state.location.pathname).toBe(ROUTES.HOME);
    expect(container.querySelector('[data-testid="home"]')).not.toBeNull();
    expect(deleteTransaction).not.toHaveBeenCalled();
  });
});
