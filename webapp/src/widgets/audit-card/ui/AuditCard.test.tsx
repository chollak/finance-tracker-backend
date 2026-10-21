// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { auditKeys, type Audit, type Goals } from '@/entities/audit';
import { BOARD_DONE, BOARD_GOALS, BOARD_OPEN } from '@/entities/audit/model/fixtures';
import { settingsKeys, type UserSettings } from '@/entities/settings';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import { AuditCard } from './AuditCard';

/**
 * FT-132, InviteCard.md, boards «Главная» and «Главная после ревизии · цели»: under the month tiles Home invites to the
 * audit — «Позже» hides the card until tomorrow with «Отменить» in the toast — and after the audit shows «Цели после
 * ревизии» in its place; both open the audit. Rendered in jsdom with Home's reads answered.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';
const NB = ' ';
const NO_GOALS: Goals = { today: '2026-10-14', startsOn: null, endsOn: null, goals: [], planMinor: 0, comparison: null };

const SETTINGS: UserSettings = {
  userId: USER_ID, theme: 'telegram', dailySummaryEnabled: true, dailySummaryTime: '21:00', auditEnabled: true, auditTime: '10:00',
  goalAlertsEnabled: true, fxOwnRateMinor: null, fxOwnSince: null, defaultAccountId: null, onboardedAt: '2026-08-01T09:00:00.000Z',
  receiptTipsSeen: 0, auditInviteSnoozedUntil: null, displayCurrency: 'UZS',
};

let client: QueryClient;
let settings: UserSettings;
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  settings = SETTINGS;
  vi.mocked(apiClient.get).mockReset().mockImplementation(async (url: string) => {
    if (url === '/settings') return { success: true, data: settings } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.patch).mockReset().mockImplementation(async (url: string, patch: unknown) => {
    if (url !== '/settings') return new Promise<never>(() => {});
    settings = { ...settings, ...(patch as Partial<UserSettings>) };
    return { success: true, data: settings } as never;
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур', username: null, signedOut: false });
  useUndoToastStore.setState({ stack: [], openSheets: 0 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderCard(audit: Audit, goals: Goals) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(settingsKeys.detail(USER_ID), settings);
  client.setQueryData(auditKeys.current(USER_ID), audit);
  client.setQueryData(auditKeys.goals(USER_ID), goals);
  router = createMemoryRouter(
    [
      { path: '/', element: <AuditCard /> },
      { path: '/audit', element: <p>Ревизия</p> },
    ],
    { initialEntries: ['/'] }
  );
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
  await settle();
}

/** The text of an element as it reads on screen: its pieces apart, ordinary spaces collapsed, the non-breaking kept. */
function shownText(element: Element | null | undefined): string {
  if (!element) return '';
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? '');
  return parts.join(' ').replace(/[ \t\n\r]+/g, ' ').trim();
}
const link = () => container.querySelector<HTMLAnchorElement>('a');
const later = () => [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Позже');
const toast = () => visibleEntry(useUndoToastStore.getState().stack, Date.now());

async function press(element: Element) {
  await act(async () => (element as HTMLElement).click());
  await settle();
}

describe('the invitation (board «Главная»)', () => {
  it('names the audit and how many spendings wait, opens it, and offers «Позже»', async () => {
    await renderCard(BOARD_OPEN, NO_GOALS);

    expect(shownText(link())).toBe('Ревизия сентября 6 трат на проверку · пара минут');
    expect(link()?.getAttribute('aria-label')).toBe('Ревизия сентября: 6 трат на проверку. Открыть');
    expect(later()?.getAttribute('aria-label')).toBe('Позже — отложить ревизию до завтра');

    await press(link()!);
    expect(router.state.location.pathname).toBe('/audit');
  });

  it('«Позже» puts it off until tomorrow; «Отменить» brings it back', async () => {
    await renderCard(BOARD_OPEN, NO_GOALS);

    await press(later()!);

    expect(apiClient.patch).toHaveBeenCalledWith('/settings', { auditInviteSnoozedUntil: '2026-10-15' });
    expect(link()).toBeNull();
    expect(toast()).toMatchObject({ title: 'Ревизия отложена', detail: 'Вернём карточку завтра' });

    await act(async () => useUndoToastStore.getState().undoVisible());
    await settle();

    expect(apiClient.patch).toHaveBeenLastCalledWith('/settings', { auditInviteSnoozedUntil: null });
    expect(link()?.getAttribute('href')).toBe('/audit');
  });

  it('stays hidden on the day it was put off', async () => {
    settings = { ...SETTINGS, auditInviteSnoozedUntil: '2026-10-15' };
    await renderCard(BOARD_OPEN, NO_GOALS);

    expect(container.textContent).toBe('');
  });
});

describe('after the audit (board «Главная после ревизии · цели»)', () => {
  it('«Цели после ревизии» with the goals and the saving, leading to the result', async () => {
    await renderCard(BOARD_DONE, BOARD_GOALS);

    expect(shownText(link())).toBe(`Цели после ревизии 4 цели · экономия до 814${NB}000${NB}сум`);
    expect(later()).toBeUndefined();
    expect(link()?.getAttribute('href')).toBe('/audit');
  });
});
