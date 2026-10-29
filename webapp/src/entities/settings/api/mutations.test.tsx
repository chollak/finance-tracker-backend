// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/entities/user';
import { apiClient, type ApiError } from '@/shared/api';
import type { SettingsPatch, UserSettings } from '../model/types';
import { useUpdateSettings } from './mutations';
import { settingsKeys, useSettings } from './queries';

/**
 * `PATCH /api/settings` pressed again before the first answer (FT-149 review): changes go out one after another, each
 * shows at once, and a failure puts back only what no later change is about to set — to what the server has, not to
 * what the screen guessed. A failure a later change of the same setting replaces says nothing: the last press decides.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';
const SERVER: UserSettings = {
  userId: 'u1', theme: 'telegram', dailySummaryEnabled: true, dailySummaryTime: '21:00', auditEnabled: true, auditTime: '10:00',
  goalAlertsEnabled: true, fxOwnRateMinor: null, fxOwnSince: null, defaultAccountId: null, onboardedAt: '2026-10-01T09:00:00.000Z',
  receiptTipsSeen: 0, auditInviteSnoozedUntil: null, displayCurrency: 'UZS',
};

interface Call {
  patch: SettingsPatch;
  resolve: (settings: UserSettings) => void;
  reject: (error: ApiError) => void;
}

let calls: Call[];
let errors: ApiError[];
let client: QueryClient;
let update: (patch: SettingsPatch) => void;
let root: Root;
let container: HTMLDivElement;

function Probe() {
  useSettings();
  const { mutate } = useUpdateSettings({ onError: (error) => errors.push(error) });
  useEffect(() => {
    update = mutate;
  }, [mutate]);
  return null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const cached = () => client.getQueryData<UserSettings>(settingsKeys.detail(USER_ID));
const OFFLINE: ApiError = { message: 'Network error', statusCode: 0 };

async function press(patch: SettingsPatch) {
  await act(async () => update(patch));
  await settle();
}

async function answer(index: number, outcome: { saved: SettingsPatch } | { failed: ApiError }) {
  await act(async () => {
    if ('saved' in outcome) calls[index].resolve({ ...SERVER, ...outcome.saved });
    else calls[index].reject(outcome.failed);
  });
  await settle();
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  errors = [];
  let reads = 0;
  // The settings are read once; after that the connection is gone, so only the rollback can put them right
  vi.mocked(apiClient.get).mockImplementation(async () => {
    reads += 1;
    if (reads === 1) return { success: true, data: SERVER } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.patch).mockImplementation(
    (_url: string, patch: unknown) =>
      new Promise((resolve, reject) => {
        calls.push({ patch: patch as SettingsPatch, resolve: (data) => resolve({ success: true, data } as never), reject });
      }) as never
  );
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    );
  });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('two changes pressed before the first answer', () => {
  it('the first failed and the second of the same setting was saved: nothing is put back and nothing is said', async () => {
    await press({ defaultAccountId: 'cash' });
    await press({ defaultAccountId: 'card' });
    expect(cached()?.defaultAccountId).toBe('card');

    await answer(0, { failed: OFFLINE });
    expect(cached()?.defaultAccountId).toBe('card');
    expect(errors).toEqual([]);

    await answer(1, { saved: { defaultAccountId: 'card' } });
    expect(cached()?.defaultAccountId).toBe('card');
    expect(errors).toEqual([]);
  });

  it('both failed: back to what the server has, said once', async () => {
    await press({ defaultAccountId: 'cash' });
    await press({ defaultAccountId: 'card' });

    await answer(0, { failed: OFFLINE });
    await answer(1, { failed: OFFLINE });

    expect(cached()?.defaultAccountId).toBeNull();
    expect(errors).toEqual([OFFLINE]);
  });

  it('the first was saved and the second failed: back to the first, as the server answered', async () => {
    await press({ defaultAccountId: 'cash' });
    await press({ defaultAccountId: 'card' });

    await answer(0, { saved: { defaultAccountId: 'cash' } });
    await answer(1, { failed: OFFLINE });

    expect(cached()?.defaultAccountId).toBe('cash');
    expect(errors).toEqual([OFFLINE]);
  });

  it('a failed change of one setting puts back only that one: a later change of another stays', async () => {
    await press({ theme: 'dark' });
    await press({ defaultAccountId: 'card' });

    await answer(0, { failed: OFFLINE });

    expect(cached()).toMatchObject({ theme: 'telegram', defaultAccountId: 'card' });
    expect(errors).toEqual([OFFLINE]);

    await answer(1, { saved: { defaultAccountId: 'card' } });
    expect(cached()).toMatchObject({ theme: 'telegram', defaultAccountId: 'card' });
  });

  it('they go out one after another, the second only after the first answer', async () => {
    await press({ defaultAccountId: 'cash' });
    await press({ defaultAccountId: 'card' });
    expect(calls.map((call) => call.patch)).toEqual([{ defaultAccountId: 'cash' }]);

    await answer(0, { saved: { defaultAccountId: 'cash' } });
    expect(calls.map((call) => call.patch)).toEqual([{ defaultAccountId: 'cash' }, { defaultAccountId: 'card' }]);
  });
});

describe('one change', () => {
  it('a failure puts back what was there and says so', async () => {
    await press({ dailySummaryEnabled: false });
    expect(cached()?.dailySummaryEnabled).toBe(false);

    await answer(0, { failed: OFFLINE });

    expect(cached()?.dailySummaryEnabled).toBe(true);
    expect(errors).toEqual([OFFLINE]);
  });
});
