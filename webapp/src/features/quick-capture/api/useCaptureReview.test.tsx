import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { deleteTransaction, patchTransaction, restoreTransaction } from '@/entities/transaction';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useCaptureStore } from '../model/captureStore';
import { reviewSessionFrom, type ReviewContext } from '../model/captureReview';
import type { CapturedTransaction } from '../model/types';
import { useCaptureReview } from './useCaptureReview';

/**
 * FT-114: what the review screen does with the records already saved by the capture. Every change is
 * patched at once; «×» deletes with «Отменить» for as long as the review lasts; «Сохранить» shows Home with
 * «Записано», whose «Отменить» takes back every record of the phrase; «Изменить» takes them back and returns
 * the text to the field.
 */

vi.mock('@/entities/transaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/transaction')>();
  return { ...actual, deleteTransaction: vi.fn(), patchTransaction: vi.fn(), restoreTransaction: vi.fn() };
});

const user = vi.hoisted(() => ({ current: { userId: '900000001' as string | null } }));
vi.mock('@/entities/user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/user')>();
  return { ...actual, useUserStore: (selector: (state: typeof user.current) => unknown) => selector(user.current) };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn(), useLocation: vi.fn() };
});

const USER_ID = '900000001';
const TEXT = 'кофе 25к, такси 18к';

const CATEGORIES: Category[] = [
  { id: 'c-gro', type: 'expense', name: 'Продукты', color: 'peach', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'groceries' },
  { id: 'c-cafe', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'cafe' },
  { id: 'c-tr', type: 'expense', name: 'Транспорт', color: 'sky', isHidden: false, isOther: false, sortOrder: 30, presetKey: 'transport' },
];

const account = (id: string, name: string): Account => ({
  id, name, kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false, sortOrder: 10, balanceMinor: 0,
});

const CONTEXT: ReviewContext = { categories: CATEGORIES, accounts: [account('card', 'Карта'), account('cash', 'Наличные')], rateMinor: null, today: '2026-10-14' };

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
          record({ id: 'a', description: 'кофе', assumptions: [{ kind: 'category', name: 'Кафе' }] }),
          record({ id: 'b', amountMinor: 1_800_000, amount: 18000, category: 'Транспорт', categoryId: 'c-tr', description: 'такси' }),
        ],
        debts: [],
        ack: { title: '', summary: '', actions: [] },
        review: { reasons: [] },
      },
      CATEGORIES
    ),
  });
}

let queryClient: QueryClient;
const navigate = vi.fn();
type ReviewHook = ReturnType<typeof useCaptureReview>;

function Probe({ onRender }: { onRender: (hook: ReviewHook) => void }) {
  onRender(useCaptureReview(CONTEXT));
  return null;
}

/** The hook as the screen holds it; each call reads the store again, as a re-render would. */
function mountReview(): ReviewHook {
  let hook: ReviewHook | undefined;
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Probe onRender={(rendered) => { hook = rendered; }} />
    </QueryClientProvider>
  );
  if (!hook) throw new Error('The hook did not render');
  return hook;
}

const shownToast = () => {
  const { stack, now } = useUndoToastStore.getState();
  return visibleEntry(stack, Math.max(now, Date.now()));
};
const toastTitles = () => useUndoToastStore.getState().stack.map((entry) => entry.title);
const items = () => useCaptureStore.getState().review?.items ?? [];
const deletedIds = () => vi.mocked(deleteTransaction).mock.calls.map(([, variables]) => variables.id);

/** A request that answers when the test says so. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const OFFLINE = { message: 'Network Error', statusCode: 0 };
const NOT_FOUND = { message: 'Transaction not found', statusCode: 404 };

beforeEach(() => {
  queryClient = new QueryClient();
  navigate.mockReset();
  vi.mocked(deleteTransaction).mockReset().mockResolvedValue(undefined);
  vi.mocked(patchTransaction).mockReset().mockResolvedValue(undefined);
  vi.mocked(restoreTransaction).mockReset().mockResolvedValue(undefined);
  vi.mocked(useNavigate).mockReturnValue(navigate);
  vi.mocked(useLocation).mockReturnValue({ pathname: ROUTES.CAPTURE_REVIEW, search: '', hash: '', key: 'r', state: { from: ROUTES.HOME } });
  vi.stubGlobal('window', { history: { state: { idx: 1 } } });
  useUndoToastStore.getState().clear();
  user.current = { userId: USER_ID };
  openReview();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a change on the review', () => {
  it('confirming the guess patches the record with the category and clears «?»', async () => {
    await mountReview().chooseCategory('a', 'c-cafe');

    expect(patchTransaction).toHaveBeenCalledWith(queryClient, { id: 'a', userId: USER_ID, patch: { categoryId: 'c-cafe' } });
    expect(items()[0]).toMatchObject({ categoryId: 'c-cafe', guessed: false });
  });

  it('another account and another date are patched too', async () => {
    const review = mountReview();

    await review.chooseAccount('b', 'cash');
    await review.chooseDate('b', '2026-10-12');

    expect(patchTransaction).toHaveBeenCalledWith(queryClient, { id: 'b', userId: USER_ID, patch: { accountId: 'cash', currency: 'UZS' } });
    expect(patchTransaction).toHaveBeenCalledWith(queryClient, { id: 'b', userId: USER_ID, patch: { date: '2026-10-12' } });
    expect(items()[1]).toMatchObject({ accountId: 'cash', date: '2026-10-12' });
  });

  it('a change the server refused is put back, and the screen says so', async () => {
    vi.mocked(patchTransaction).mockRejectedValueOnce(OFFLINE);

    await mountReview().chooseCategory('a', 'c-gro');

    expect(items()[0]).toMatchObject({ categoryId: 'c-cafe', guessed: true });
    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Не получилось изменить' });
  });

  it('a refused change takes back only itself: a change made meanwhile stays, as on the server', async () => {
    const confirm = deferred();
    vi.mocked(patchTransaction).mockReturnValueOnce(confirm.promise).mockResolvedValueOnce(undefined);
    const review = mountReview();

    const confirming = review.chooseCategory('a', 'c-cafe');
    await mountReview().chooseAccount('a', 'cash');
    confirm.reject(OFFLINE);
    await confirming;

    expect(items()[0]).toMatchObject({ categoryId: 'c-cafe', guessed: true, accountId: 'cash' });
  });
});

describe('«×»', () => {
  it('deletes the record and says «Убрано» with «Отменить», which brings it back', async () => {
    await mountReview().remove('a');

    expect(deleteTransaction).toHaveBeenCalledWith(queryClient, { id: 'a', userId: USER_ID });
    expect(items()[0].removed).toBe(true);
    expect(shownToast()).toMatchObject({ kind: 'deleted', title: 'Убрано', detail: `Кафе · ${MINUS}25${NBSP}000${NBSP}сум` });

    await useUndoToastStore.getState().undoVisible();

    expect(restoreTransaction).toHaveBeenCalledWith(queryClient, { id: 'a', userId: USER_ID });
    expect(items()[0].removed).toBe(false);
  });

  it('shows no «Убрано» when the review ended while the record was being deleted', async () => {
    const deleting = deferred();
    vi.mocked(deleteTransaction).mockReturnValueOnce(deleting.promise);

    const removing = mountReview().remove('a');
    await mountReview().cancel(vi.fn());
    deleting.resolve();
    await removing;

    expect(toastTitles()).not.toContain('Убрано');
  });
});

describe('«Сохранить»', () => {
  it('shows Home with «Записано», and closes the review', async () => {
    mountReview().save();

    expect(navigate).toHaveBeenCalledWith(-1);
    expect(useCaptureStore.getState().review).toBeNull();
    expect(shownToast()).toMatchObject({ kind: 'saved', title: 'Записано', detail: '2 операции · Кафе, Транспорт' });
  });

  it('its «Отменить» takes back every record of the phrase still on the screen', async () => {
    const review = mountReview();
    await review.remove('b');
    mountReview().save();

    await useUndoToastStore.getState().undoVisible();

    expect(deletedIds()).toEqual(['b', 'a']);
  });

  it('takes «Убрано» away: the removed record stays removed, also after «Записано» is undone', async () => {
    await mountReview().remove('b');
    mountReview().save();

    expect(toastTitles()).toEqual(['Записано']);
    await useUndoToastStore.getState().undoVisible();

    expect(shownToast()).toBeNull();
    expect(restoreTransaction).not.toHaveBeenCalled();
  });

  it('a retry of «Отменить» deletes only the records the first press could not', async () => {
    mountReview().save();
    vi.mocked(deleteTransaction).mockRejectedValueOnce(OFFLINE); // «a» fails, «b» is deleted

    await useUndoToastStore.getState().undoVisible();
    expect(shownToast()).toMatchObject({ title: 'Не получилось отменить' });

    vi.mocked(deleteTransaction).mockClear();
    await useUndoToastStore.getState().undoVisible();

    expect(deletedIds()).toEqual(['a']);
    expect(shownToast()).toBeNull();
  });

  it('counts a record the server no longer has as taken back', async () => {
    mountReview().save();
    vi.mocked(deleteTransaction).mockRejectedValueOnce(NOT_FOUND);

    await useUndoToastStore.getState().undoVisible();

    expect(shownToast()).toBeNull();
  });
});

describe('«Изменить» and «Назад»', () => {
  it('take back the records and return the text to the field', async () => {
    const leave = vi.fn();

    await mountReview().cancel(leave);

    expect(deletedIds()).toEqual(['a', 'b']);
    expect(useCaptureStore.getState()).toMatchObject({ draft: TEXT, review: null });
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('a removed record is not deleted twice', async () => {
    await mountReview().remove('a');
    vi.mocked(deleteTransaction).mockClear();

    await mountReview().cancel(vi.fn());

    expect(deletedIds()).toEqual(['b']);
  });

  it('take «Убрано» away too: a record removed from a cancelled phrase does not come back', async () => {
    await mountReview().remove('b');

    await mountReview().cancel(vi.fn());
    await useUndoToastStore.getState().undoVisible();

    expect(restoreTransaction).not.toHaveBeenCalled();
    expect(toastTitles()).not.toContain('Убрано');
    expect(shownToast()).toBeNull();
  });

  it('when the records could not be taken back, the review stays and says so', async () => {
    vi.mocked(deleteTransaction).mockRejectedValueOnce(OFFLINE);
    const leave = vi.fn();

    await mountReview().cancel(leave);

    expect(leave).not.toHaveBeenCalled();
    expect(useCaptureStore.getState().review).not.toBeNull();
    expect(items().map((item) => item.removed)).toEqual([false, true]); // «b» is gone, «a» waits for another press
    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Не получилось отменить' });
  });

  it('a record the server no longer has counts as taken back', async () => {
    vi.mocked(deleteTransaction).mockRejectedValueOnce(NOT_FOUND);
    const leave = vi.fn();

    await mountReview().cancel(leave);

    expect(leave).toHaveBeenCalledTimes(1);
    expect(useCaptureStore.getState()).toMatchObject({ draft: TEXT, review: null });
  });
});
