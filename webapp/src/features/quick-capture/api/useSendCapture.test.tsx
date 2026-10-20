import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCategories, type Category } from '@/entities/category';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import { useCaptureStore } from '../model/captureStore';
import type { CapturedTransaction, QuickCaptureResult } from '../model/types';
import { useQuickCapture } from './mutations';
import { useSendCapture } from './useSendCapture';

/**
 * FT-114: the composer's send. The text goes to POST /api/quick-capture; the records it made — one or
 * several — open one review; nothing understood keeps the text and says so. Rendered without a DOM: the
 * hook is mounted once and `send` pressed by hand.
 */

vi.mock('./mutations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mutations')>();
  return { ...actual, useQuickCapture: vi.fn() };
});

vi.mock('@/entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/category')>();
  return { ...actual, useCategories: vi.fn() };
});

const user = vi.hoisted(() => ({ current: { userId: '900000001' as string | null, userName: 'Шукур', userType: 'telegram' as string | null } }));
vi.mock('@/entities/user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/user')>();
  return { ...actual, useUserStore: (selector: (state: typeof user.current) => unknown) => selector(user.current) };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn(), useLocation: vi.fn() };
});

const CATEGORIES: Category[] = [
  { id: 'c-cafe', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'cafe' },
];

const mutateAsync = vi.fn();
const navigate = vi.fn();

function result(transactions: Array<Partial<CapturedTransaction>>, text = 'кофе 25к, такси 18к'): QuickCaptureResult {
  return {
    status: transactions.length ? 'saved' : 'no_transaction',
    text,
    transactions: transactions.map((overrides, index) => ({
      id: `t${index + 1}`, amount: 25000, amountMinor: 2_500_000, currency: 'UZS', type: 'expense', semanticType: 'expense',
      category: 'Кафе', categoryId: 'c-cafe', accountId: 'card', date: '2026-10-14', needsReview: false, countsAsRealExpense: true,
      ...overrides,
    })),
    debts: [],
    ack: { title: '', summary: '', actions: [] },
    review: { reasons: [] },
  };
}

type SendHook = ReturnType<typeof useSendCapture>;

function Probe({ onRender }: { onRender: (hook: SendHook) => void }) {
  onRender(useSendCapture());
  return null;
}

function mountSend(): SendHook {
  let hook: SendHook | undefined;
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
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
const sentClientIds = () => mutateAsync.mock.calls.map(([input]) => input.clientId as string);

beforeEach(() => {
  mutateAsync.mockReset();
  navigate.mockReset();
  vi.mocked(useQuickCapture).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<typeof useQuickCapture>);
  vi.mocked(useCategories).mockReturnValue({ data: CATEGORIES } as unknown as ReturnType<typeof useCategories>);
  vi.mocked(useNavigate).mockReturnValue(navigate);
  vi.mocked(useLocation).mockReturnValue({ pathname: ROUTES.HOME, search: '', hash: '', key: 'home', state: null });
  useUndoToastStore.getState().clear();
  useCaptureStore.setState({ draft: 'кофе 25к, такси 18к', review: null });
  user.current = { userId: '900000001', userName: 'Шукур', userType: 'telegram' };
});

describe('a phrase that made records', () => {
  it('sends the text with a client id', async () => {
    mutateAsync.mockResolvedValue(result([{}]));

    await mountSend().send('кофе 25к, такси 18к');

    expect(mutateAsync).toHaveBeenCalledWith({
      text: 'кофе 25к, такси 18к',
      userId: '900000001',
      userName: 'Шукур',
      clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('opens one review of all its records and empties the field', async () => {
    mutateAsync.mockResolvedValue(result([{ id: 't1' }, { id: 't2', amountMinor: 1_800_000 }]));

    await mountSend().send('кофе 25к, такси 18к');

    const { review, draft } = useCaptureStore.getState();
    expect(review?.text).toBe('кофе 25к, такси 18к');
    expect(review?.items.map((item) => item.id)).toEqual(['t1', 't2']);
    expect(draft).toBe('');
    expect(navigate).toHaveBeenCalledWith(ROUTES.CAPTURE_REVIEW, { state: { from: ROUTES.HOME } });
  });

  it('a new send after a written one is a new capture with a new client id', async () => {
    mutateAsync.mockResolvedValue(result([{}]));
    const { send } = mountSend();

    await send('кофе 25к');
    await send('кофе 25к');

    const [first, second] = sentClientIds();
    expect(second).not.toBe(first);
  });
});

describe('a phrase that made nothing', () => {
  it('keeps the text, opens nothing and says what to write', async () => {
    mutateAsync.mockResolvedValue(result([], 'привет'));

    await mountSend().send('привет');

    expect(useCaptureStore.getState()).toMatchObject({ draft: 'кофе 25к, такси 18к', review: null });
    expect(navigate).not.toHaveBeenCalled();
    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Не понял, что записать', detail: 'Напишите, что и сколько: «такси 18к»' });
    expect(shownToast()?.undo).toBeUndefined();
  });
});

describe('a send that failed', () => {
  it('keeps the text and says the connection is the problem', async () => {
    mutateAsync.mockRejectedValue({ message: 'Network Error', statusCode: 0 });

    await mountSend().send('кофе 25к');

    expect(useCaptureStore.getState().draft).toBe('кофе 25к, такси 18к');
    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Нет связи с сервером' });
  });

  it('a press again sends the same client id, so a lost answer does not write twice (FT-106)', async () => {
    mutateAsync.mockRejectedValueOnce({ message: 'timeout', statusCode: 0 }).mockResolvedValueOnce(result([{}]));
    const { send } = mountSend();

    await send('кофе 25к');
    await send('кофе 25к');

    const [first, second] = sentClientIds();
    expect(second).toBe(first);
  });
});
