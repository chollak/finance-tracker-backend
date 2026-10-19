import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { deleteTransaction, useCreateTransaction } from '@/entities/transaction';
import { toLocalDate } from '@/shared/lib/dates';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import type { QuickChip } from '../model/quickChips';
import { useQuickChip } from './useQuickChip';

/**
 * FT-114, Composer.md: a tap on a chip writes the record at once — today, its category, note, amount and
 * account — and shows «Записано» with «Отменить», which really deletes it.
 */

vi.mock('@/entities/transaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/transaction')>();
  return { ...actual, useCreateTransaction: vi.fn(), deleteTransaction: vi.fn() };
});

const user = vi.hoisted(() => ({ current: { userId: '900000001' as string | null, userName: 'Шукур' } }));
vi.mock('@/entities/user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/user')>();
  return { ...actual, useUserStore: (selector: (state: typeof user.current) => unknown) => selector(user.current) };
});

const CHIP: QuickChip = {
  key: 'c1', name: 'Кофе', amount: `25${NBSP}000`, color: 'rose', aria: '',
  record: { categoryId: 'c-cafe', categoryName: 'Кафе', note: 'Кофе', amountMinor: 2_500_000, currency: 'UZS', accountId: 'card', accountName: 'Карта' },
};

const mutateAsync = vi.fn();
let queryClient: QueryClient;
type ChipHook = ReturnType<typeof useQuickChip>;

function Probe({ onRender }: { onRender: (hook: ChipHook) => void }) {
  onRender(useQuickChip());
  return null;
}

function mountChip(): ChipHook {
  let hook: ChipHook | undefined;
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

beforeEach(() => {
  queryClient = new QueryClient();
  mutateAsync.mockReset();
  vi.mocked(deleteTransaction).mockReset().mockResolvedValue(undefined);
  vi.mocked(useCreateTransaction).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<typeof useCreateTransaction>);
  useUndoToastStore.getState().clear();
  user.current = { userId: '900000001', userName: 'Шукур' };
});

describe('a tap on a chip', () => {
  it('writes the expense of today at once, in minor units, with its category, note and account', async () => {
    mutateAsync.mockResolvedValue({ id: 't1' });

    await mountChip().write(CHIP);

    expect(mutateAsync).toHaveBeenCalledWith({
      type: 'expense',
      amount: 25_000,
      amountMinor: 2_500_000,
      currency: 'UZS',
      accountId: 'card',
      categoryId: 'c-cafe',
      category: 'Кафе',
      description: 'Кофе',
      date: toLocalDate(new Date()),
      userId: '900000001',
      userName: 'Шукур',
      clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('says «Записано» with what was written, and «Отменить» deletes it', async () => {
    mutateAsync.mockResolvedValue({ id: 't1' });

    await mountChip().write(CHIP);

    expect(shownToast()).toMatchObject({ kind: 'saved', title: 'Записано', detail: `Кофе · ${MINUS}25${NBSP}000${NBSP}сум · Карта` });
    await useUndoToastStore.getState().undoVisible();
    expect(deleteTransaction).toHaveBeenCalledWith(queryClient, { id: 't1', userId: '900000001' });
  });

  it('says when it could not write, with nothing to undo', async () => {
    mutateAsync.mockRejectedValue({ message: 'Network Error', statusCode: 0 });

    await mountChip().write(CHIP);

    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Не получилось записать' });
    expect(shownToast()?.undo).toBeUndefined();
  });
});
