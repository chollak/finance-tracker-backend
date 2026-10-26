import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { deleteTransaction, pendingRecordsOf, useCreateTransaction } from '@/entities/transaction';
import { memoryOfflineStorage, setOfflineStorage, useConnectivityStore, useOutboxStore } from '@/shared/lib/offline';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import type { ManualEntryRecord } from '../model/manualEntry';
import { useSaveManualEntry } from './useSaveManualEntry';

/**
 * FT-113: the glue between the manual entry screen and the save. The record goes out in minor units with
 * its account, currency, category and one client id per record as entered; then Home shows «Записано»
 * with «Отменить». Rendered without a DOM: the hook is mounted once and its `save` pressed by hand.
 */

vi.mock('@/entities/transaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/transaction')>();
  return { ...actual, useCreateTransaction: vi.fn(), deleteTransaction: vi.fn() };
});

// zustand answers a server render with the store's initial state, so the signed-in user comes from here
const user = vi.hoisted(() => ({ current: { userId: null as string | null, userName: null as string | null } }));
vi.mock('@/entities/user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/user')>();
  return { ...actual, useUserStore: (selector: (state: typeof user.current) => unknown) => selector(user.current) };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn(), useLocation: vi.fn() };
});

const USER_ID = '900000001';

const RECORD: ManualEntryRecord = {
  type: 'expense',
  amountMinor: 18_640_000,
  currency: 'UZS',
  accountId: 'card',
  categoryId: 'products',
  categoryName: 'Продукты',
  date: '2026-10-14',
  note: 'супермаркет',
};

const mutateAsync = vi.fn();
const navigate = vi.fn();
let queryClient: QueryClient;

/** Who opened the screen (the link's state) and react-router's index of the entry (`history.state.idx`). */
function openedFrom(from: string | null, historyIndex: number): void {
  vi.mocked(useLocation).mockReturnValue({
    pathname: '/add',
    search: '',
    hash: '',
    key: 'entry',
    state: from === null ? null : { from },
  });
  vi.stubGlobal('window', { history: { state: { idx: historyIndex } } });
}

type SaveHook = ReturnType<typeof useSaveManualEntry>;

function Probe({ onRender }: { onRender: (hook: SaveHook) => void }) {
  onRender(useSaveManualEntry());
  return null;
}

/** The hook as the screen holds it: mounted once, `save` pressed as often as the user presses. */
function mountSave(): SaveHook {
  let hook: SaveHook | undefined;
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Probe onRender={(rendered) => { hook = rendered; }} />
    </QueryClientProvider>
  );
  if (!hook) throw new Error('The hook did not render');
  return hook;
}

const sentClientIds = () => mutateAsync.mock.calls.map(([input]) => input.clientId as string);

const shownToast = () => {
  const { stack, now } = useUndoToastStore.getState();
  return visibleEntry(stack, Math.max(now, Date.now()));
};

beforeEach(() => {
  queryClient = new QueryClient();
  mutateAsync.mockReset();
  navigate.mockReset();
  vi.mocked(deleteTransaction).mockReset().mockResolvedValue(undefined);
  vi.mocked(useCreateTransaction).mockReturnValue({
    mutateAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useCreateTransaction>);
  vi.mocked(useNavigate).mockReturnValue(navigate);
  openedFrom('/', 1);
  useUndoToastStore.getState().clear();
  user.current = { userId: USER_ID, userName: 'Шукур' };
  setOfflineStorage(memoryOfflineStorage());
  useOutboxStore.setState({ entries: [] });
  useConnectivityStore.setState({ browserOnline: true, lost: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('what a save sends', () => {
  it('the record in minor units with its account, currency, category id and a client id', async () => {
    mutateAsync.mockResolvedValue({ id: 't1' });

    await mountSave().save(RECORD, 'Карта');

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      type: 'expense',
      amount: 186_400,
      amountMinor: 18_640_000,
      currency: 'UZS',
      accountId: 'card',
      categoryId: 'products',
      category: 'Продукты',
      date: '2026-10-14',
      description: 'супермаркет',
      userId: USER_ID,
      userName: 'Шукур',
      clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('a dollar record keeps its cents and its currency', async () => {
    mutateAsync.mockResolvedValue({ id: 't2' });

    await mountSave().save({ ...RECORD, amountMinor: 1_250, currency: 'USD', accountId: 'usd' }, 'Доллары');

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ amount: 12.5, amountMinor: 1_250, currency: 'USD', accountId: 'usd' }));
  });

  it('nothing is sent without a user', async () => {
    user.current = { userId: null, userName: null };

    await mountSave().save(RECORD, 'Карта');

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('one client id per record as entered (FT-106)', () => {
  it('a press after a failed save sends the same client id, so the server keeps one record', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('answer lost')).mockResolvedValueOnce({ id: 't1' });
    const { save } = mountSave();

    await save(RECORD, 'Карта');
    await save(RECORD, 'Карта');

    const [first, second] = sentClientIds();
    expect(sentClientIds()).toHaveLength(2);
    expect(second).toBe(first);
  });

  it('a changed record after a failed save is a new record with a new client id', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 't1' });
    const { save } = mountSave();

    await save(RECORD, 'Карта');
    await save({ ...RECORD, amountMinor: 18_650_000 }, 'Карта');

    const [first, second] = sentClientIds();
    expect(second).not.toBe(first);
  });
});

describe('after a save', () => {
  it('Home shows «Записано» with what was written', async () => {
    mutateAsync.mockResolvedValue({ id: 't1' });

    await mountSave().save(RECORD, 'Карта');

    expect(shownToast()).toMatchObject({
      kind: 'saved',
      title: 'Записано',
      detail: `супермаркет · ${MINUS}186${NBSP}400${NBSP}сум · Карта`,
    });
  });

  it('«Отменить» removes the saved record of this user', async () => {
    mutateAsync.mockResolvedValue({ id: 't1' });

    await mountSave().save(RECORD, 'Карта');
    await useUndoToastStore.getState().undoVisible();

    expect(deleteTransaction).toHaveBeenCalledTimes(1);
    expect(deleteTransaction).toHaveBeenCalledWith(queryClient, { id: 't1', userId: USER_ID });
  });

  it('opened from Home: one step back to it, so Home is not stacked twice', async () => {
    mutateAsync.mockResolvedValue({ id: 't1' });
    openedFrom('/', 1);

    await mountSave().save(RECORD, 'Карта');

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('opened from «Ещё»: Home takes the screen’s place', async () => {
    mutateAsync.mockResolvedValue({ id: 't1' });
    openedFrom('/more', 2);

    await mountSave().save(RECORD, 'Карта');

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('opened by a bot link: Home takes the screen’s place, «Назад» never reopens the form', async () => {
    mutateAsync.mockResolvedValue({ id: 't1' });
    openedFrom(null, 0);

    await mountSave().save(RECORD, 'Карта');

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});

describe('a failed save', () => {
  it('keeps the screen: no toast and no way to Home', async () => {
    mutateAsync.mockRejectedValue(new Error('offline'));

    await mountSave().save(RECORD, 'Карта');

    expect(shownToast()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('then a save that goes through shows the toast and Home once', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 't1' });
    const { save } = mountSave();

    await save(RECORD, 'Карта');
    await save(RECORD, 'Карта');

    expect(shownToast()).toMatchObject({ title: 'Записано' });
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

/**
 * FT-129, board «Ручной ввод без связи»: the manual entry works without a connection. The record goes into the outbox
 * on the device and Home says it will be sent when the connection is back.
 */
describe('a save without a connection', () => {
  it('writes the record on the device and shows Home with «Записано на этом устройстве»', async () => {
    useConnectivityStore.setState({ browserOnline: false });

    await mountSave().save(RECORD, 'Карта');

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(pendingRecordsOf(USER_ID)).toEqual([
      expect.objectContaining({
        type: 'expense',
        amountMinor: 18_640_000,
        currency: 'UZS',
        accountId: 'card',
        categoryId: 'products',
        categoryName: 'Продукты',
        date: '2026-10-14',
        note: 'супермаркет',
      }),
    ]);
    expect(shownToast()).toMatchObject({
      kind: 'saved',
      title: 'Записано на этом устройстве',
      detail: `супермаркет · ${MINUS}186${NBSP}400${NBSP}сум · отправится со связью`,
    });
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('a send that got no answer is kept on the device with the client id it was sent with', async () => {
    mutateAsync.mockRejectedValue({ message: 'Network error', statusCode: 0 });

    await mountSave().save(RECORD, 'Карта');

    const [sent] = sentClientIds();
    expect(pendingRecordsOf(USER_ID)).toEqual([expect.objectContaining({ clientId: sent })]);
    expect(shownToast()).toMatchObject({ title: 'Записано на этом устройстве' });
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('a save the server refused stays on the screen, as before', async () => {
    mutateAsync.mockRejectedValue({ message: 'Validation failed', statusCode: 400 });

    await mountSave().save(RECORD, 'Карта');

    expect(pendingRecordsOf(USER_ID)).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });
});
