// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import type { FrequentRecord } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { ROUTES } from '@/shared/lib/constants/routes';
import { NBSP } from '@/shared/lib/money';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import { memoryOfflineStorage, setOfflineStorage, useConnectivityStore, useOutboxStore } from '@/shared/lib/offline';
import { QUICK_CAPTURE_TIMEOUT_MS } from '../api/mutations';
import { CAPTURE_TIMED_OUT, RECEIPT_NOT_YET, VOICE_NOT_YET } from '../model/captureNotices';
import { useCaptureStore } from '../model/captureStore';
import { Composer } from './Composer';

/**
 * FT-114: the composer as Home mounts it. The microphone and the camera say honestly where voice and
 * receipts work today (until FT-117 and FT-135); the quick chips are the user's frequent expenses, and the
 * four starters of the prototype when the frequent ones could not be read. Rendered in jsdom.
 */

const CATEGORIES: Category[] = [
  { id: 'c-gro', type: 'expense', name: 'Продукты', color: 'peach', isHidden: false, isOther: false, sortOrder: 10, presetKey: 'groceries' },
  { id: 'c-cafe', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'cafe' },
  { id: 'c-tr', type: 'expense', name: 'Транспорт', color: 'sky', isHidden: false, isOther: false, sortOrder: 30, presetKey: 'transport' },
];

const ACCOUNTS: Account[] = [
  { id: 'card', name: 'Карта', kind: 'card', currency: 'UZS', openingBalanceMinor: 0, openingDate: '2026-10-01', isHidden: false, sortOrder: 10, balanceMinor: 0 },
];

const SAMSA: FrequentRecord = { categoryId: 'c-cafe', note: 'Самса', amountMinor: 1_200_000, currency: 'UZS', accountId: 'card', count: 4 };

const frequent = vi.hoisted(() => ({ current: { data: undefined as unknown, isError: false } }));

vi.mock('@/entities/transaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/transaction')>();
  return { ...actual, useFrequentRecords: () => frequent.current };
});
vi.mock('@/entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/category')>();
  return { ...actual, useCategories: () => ({ data: CATEGORIES }) };
});
vi.mock('@/entities/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/account')>();
  return { ...actual, useAccounts: () => ({ data: { accounts: ACCOUNTS } }) };
});
vi.mock('@/entities/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/settings')>();
  return { ...actual, useSettings: () => ({ data: { defaultAccountId: 'card' } }) };
});

const USER_ID = '900000001';
const STARTERS = ['Кофе', 'Такси', 'Обед', 'Продукты'];

let root: Root | null = null;
let container: HTMLDivElement;
let shownPath = '';

/** Where the app went: the path the router is on. */
function Where() {
  const { pathname } = useLocation();
  useEffect(() => {
    shownPath = pathname;
  });
  return null;
}

async function renderComposer(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[ROUTES.HOME]}>
          <Composer />
          <Where />
        </MemoryRouter>
      </QueryClientProvider>
    );
  });
}

async function press(label: string): Promise<void> {
  const target = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!target) throw new Error(`No button «${label}»`);
  await act(async () => {
    target.click();
  });
}

/** The names on the quick chips, in their order. */
const chipNames = () =>
  [...container.querySelectorAll('[aria-label="Частые операции"] button')].map((chip) => chip.querySelector('span')?.textContent);

const shownToast = () => visibleEntry(useUndoToastStore.getState().stack, Date.now());

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  frequent.current = { data: [SAMSA], isError: false };
  useUndoToastStore.getState().clear();
  useCaptureStore.setState({ draft: '', review: null });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  setOfflineStorage(memoryOfflineStorage());
  useOutboxStore.setState({ entries: [] });
  useConnectivityStore.setState({ browserOnline: true, lost: false });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('the microphone and the camera', () => {
  it('the microphone says where voice works today', async () => {
    await renderComposer();

    await press('Голосовой ввод');

    expect(shownToast()).toMatchObject({ kind: 'info', title: VOICE_NOT_YET.title, detail: VOICE_NOT_YET.detail });
    expect(shownToast()?.undo).toBeUndefined();
  });

  it('the camera says receipts are not here yet', async () => {
    await renderComposer();

    await press('Фото чека');

    expect(shownToast()).toMatchObject({ kind: 'info', title: RECEIPT_NOT_YET.title, detail: RECEIPT_NOT_YET.detail });
  });
});

describe('the quick chips', () => {
  it('are the user’s frequent expenses', async () => {
    await renderComposer();

    expect(chipNames()).toEqual(['Самса']);
    expect(container.querySelector(`button[aria-label="Записать сразу: Самса, 12${NBSP}000${NBSP}сум"]`)).not.toBeNull();
  });

  it('are the four starters when the frequent ones could not be read', async () => {
    frequent.current = { data: undefined, isError: true };

    await renderComposer();

    expect(chipNames()).toEqual(STARTERS);
  });
});

/**
 * FT-146: after a send the field says «Распознаю…» at once and the round button waits with pulsing dots, until the
 * server answers or fails. The wait has an end on the device too: with no answer in QUICK_CAPTURE_TIMEOUT_MS the toast
 * says so and the phrase stays in the field, to send again. Real mutation, `fetch` stubbed.
 */
describe('sending a phrase (FT-146)', () => {
  const PHRASE = 'кофе 25к';
  const SAVED = {
    success: true,
    data: {
      status: 'saved',
      text: PHRASE,
      transactions: [
        {
          id: 't1', amount: 25000, amountMinor: 2_500_000, currency: 'UZS', type: 'expense', semanticType: 'expense', category: 'Кафе',
          categoryId: 'c-cafe', accountId: 'card', date: '2026-10-14', needsReview: false, countsAsRealExpense: true,
        },
      ],
      debts: [],
      ack: { title: '', summary: '', actions: [] },
      review: { reasons: [] },
    },
  };

  /** The answer of POST /api/quick-capture, given by hand; every other request gets an empty list. */
  let answer: { resolve: (response: Response) => void } | null;
  let captureSignal: AbortSignal | undefined;

  const status = () => container.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? null;
  const field = () => container.querySelector<HTMLInputElement>('input[type="text"]');

  /**
   * Lets `ms` pass, then a few more. TanStack Query tells the screen about a mutation's state on the next tick
   * (`setTimeout(0)`), which fake timers hold until time moves — and a zero timer set while time is moving is due 1 ms
   * later — and a settled request needs a few promise hops to get there.
   */
  async function wait(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
      for (let tick = 0; tick < 5; tick += 1) await vi.advanceTimersByTimeAsync(1);
    });
  }

  async function typeAndSend(text: string): Promise<void> {
    await act(async () => {
      useCaptureStore.setState({ draft: text });
    });
    await act(async () => {
      container.querySelector<HTMLFormElement>('form')!.requestSubmit();
    });
    await wait(0);
  }

  async function serverAnswers(body: unknown, statusCode = 200): Promise<void> {
    await act(async () => {
      answer?.resolve(new Response(JSON.stringify(body), { status: statusCode, headers: { 'Content-Type': 'application/json' } }));
    });
    await wait(0);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    answer = null;
    captureSignal = undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (!String(url).endsWith('/quick-capture')) {
          return Promise.resolve(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));
        }
        captureSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve, reject) => {
          answer = { resolve };
          init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        });
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('says «Распознаю…» right after the send, before any answer', async () => {
    await renderComposer();
    expect(status()).toBe('');

    await typeAndSend(PHRASE);

    expect(status()).toBe('Распознаю…');
    expect(field()?.value).toBe(PHRASE);
    expect(container.querySelector('button[type="submit"]')?.getAttribute('aria-busy')).toBe('true');
  });

  it('stops when the records came: the review opens', async () => {
    await renderComposer();
    await typeAndSend(PHRASE);

    await serverAnswers(SAVED);

    expect(status()).toBe('');
    expect(shownPath).toBe(ROUTES.CAPTURE_REVIEW);
  });

  it('stops when the send failed, and the phrase stays in the field', async () => {
    await renderComposer();
    await typeAndSend(PHRASE);

    await serverAnswers({ success: false, error: { code: 'EXTERNAL_SERVICE_ERROR', message: 'Request timed out.' } }, 502);

    expect(status()).toBe('');
    expect(field()?.value).toBe(PHRASE);
    expect(shownToast()).toMatchObject({ kind: 'info', title: 'Не удалось записать' });
  });

  it('gives up after QUICK_CAPTURE_TIMEOUT_MS: the toast says so and the phrase stays in the field', async () => {
    await renderComposer();
    await typeAndSend(PHRASE);

    await wait(QUICK_CAPTURE_TIMEOUT_MS - 1_000);
    expect(status()).toBe('Распознаю…');
    expect(captureSignal?.aborted).toBe(false);

    await wait(1_000);

    expect(captureSignal?.aborted).toBe(true);
    expect(status()).toBe('');
    expect(field()?.value).toBe(PHRASE);
    expect(shownPath).toBe(ROUTES.HOME);
    expect(shownToast()).toMatchObject({
      kind: 'info',
      title: CAPTURE_TIMED_OUT.title,
      detail: CAPTURE_TIMED_OUT.detail,
    });
  });
});

/**
 * FT-129, OfflineBar.md, boards «Главная без связи», «Голос без связи», «Чек без связи»: without a connection the
 * microphone is not the main button any more (`track`), and it and the camera open their honest screens — voice and
 * receipts are read on the server — with «Ввести вручную».
 */
describe('without a connection', () => {
  beforeEach(() => {
    useConnectivityStore.setState({ browserOnline: false });
  });

  it('the microphone says it does not work and opens «Голос работает только со связью»', async () => {
    await renderComposer();

    await press('Голосовой ввод — без связи не работает');

    expect(shownPath).toBe(ROUTES.VOICE_OFFLINE);
    expect(shownToast()).toBeNull();
  });

  it('the camera opens «Чек читается только со связью»', async () => {
    await renderComposer();

    await press('Фото чека');

    expect(shownPath).toBe(ROUTES.RECEIPT_OFFLINE);
  });

  it('the microphone works again once the connection is back', async () => {
    await renderComposer();
    await act(async () => {
      useConnectivityStore.setState({ browserOnline: true });
    });

    await press('Голосовой ввод');

    expect(shownPath).toBe(ROUTES.HOME);
    expect(shownToast()).toMatchObject({ title: VOICE_NOT_YET.title });
  });
});
