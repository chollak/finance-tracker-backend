// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactNode } from 'react';
import { applyCandidateChange, applyGoalAnswer, type Audit, type CandidateChange, type Goals, type SubscriptionAnswer } from '@/entities/audit';
import { BOARD_DONE, BOARD_GOALS, BOARD_OPEN, EARLY } from '@/entities/audit/model/fixtures';
import type { Category } from '@/entities/category';
import type { UserSettings } from '@/entities/settings';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { useUndoToastStore } from '@/shared/lib/undo';
import { AuditCard } from '@/widgets/audit-card';
import { AuditPage } from './AuditPage';

/**
 * FT-132, row «Ревизия трат — что было лишним»: the audit opens on its candidates, each «Нужно / Лишнее» is saved by
 * the press (a second press takes it back), «Готово» after the first mark shows the plan and the goals, «Изменить
 * отметки» returns to the list; a subscription's «Уже отменено» and «Напомнить» are saved on the goal; before a whole
 * month there is only when the first audit comes. Rendered in jsdom with the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';
const NB = ' ';

const category = (id: string, name: string, color: Category['color']): Category => ({
  id, name, color, type: 'expense', isHidden: false, isOther: false, sortOrder: 0, presetKey: null,
});
const CATEGORIES = [
  category('cat-cafe', 'Кафе', 'rose'),
  category('cat-shopping', 'Покупки', 'butter'),
  category('cat-transport', 'Транспорт', 'sky'),
  category('cat-telecom', 'Связь', 'lilac'),
];

const SETTINGS: UserSettings = {
  userId: USER_ID, theme: 'telegram', dailySummaryEnabled: true, dailySummaryTime: '21:00', auditEnabled: true, auditTime: '10:00',
  goalAlertsEnabled: true, fxOwnRateMinor: null, fxOwnSince: null, defaultAccountId: null, onboardedAt: '2026-08-01T09:00:00.000Z',
  receiptTipsSeen: 0, auditInviteSnoozedUntil: null, displayCurrency: 'UZS',
};

/** `GET /api/goals`: none until «Готово», then the audit's goals as they are now. */
const goalsOf = (audit: Audit): Goals =>
  audit.state === 'done' ? { ...BOARD_GOALS, goals: audit.goals } : { today: audit.today, startsOn: null, endsOn: null, goals: [], planMinor: 0, comparison: null };

/** The audit as the server keeps it; the stubs below change it as the API would. */
let server: Audit;
let settings: UserSettings;
let failNextMark: boolean;
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  server = BOARD_OPEN;
  settings = SETTINGS;
  failNextMark = false;
  vi.mocked(apiClient.get).mockReset().mockImplementation(async (url: string) => {
    if (url === '/audits/current') return { success: true, data: server } as never;
    if (url === '/categories') return { success: true, data: CATEGORIES } as never;
    if (url === '/goals') return { success: true, data: goalsOf(server) } as never;
    if (url === '/settings') return { success: true, data: settings } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.patch).mockReset().mockImplementation(async (url: string, body: unknown) => {
    const mark = url.match(/^\/audits\/audit-sep\/candidates\/(.+)$/);
    if (mark) {
      if (failNextMark) {
        failNextMark = false;
        throw { message: 'Network error', statusCode: 0 };
      }
      server = applyCandidateChange(server, mark[1], body as CandidateChange);
      return { success: true, data: server } as never;
    }
    const goal = url.match(/^\/goals\/(.+)$/);
    if (goal) {
      const changed = applyGoalAnswer(server.goals.find((entry) => entry.id === goal[1])!, (body as { subscription: SubscriptionAnswer }).subscription);
      server = { ...server, goals: server.goals.map((entry) => (entry.id === changed.id ? changed : entry)) };
      return { success: true, data: changed } as never;
    }
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.post).mockReset().mockImplementation(async (url: string) => {
    if (url === '/audits/audit-sep/finish') {
      server = { ...server, state: 'done', doneOn: server.doneOn ?? '2026-10-14', goals: BOARD_DONE.goals, comparison: BOARD_DONE.comparison };
      return { success: true, data: server } as never;
    }
    return new Promise<never>(() => {});
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

async function renderAudit(from: string[] = ['/', '/audit'], { home = <p>Главная</p>, staleTime = 0 }: { home?: ReactNode; staleTime?: number } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } });
  router = createMemoryRouter(
    [
      { path: '/audit', element: <AuditPage /> },
      { path: '/', element: home },
      { path: '/more', element: <p>Ещё</p> },
    ],
    { initialEntries: from, initialIndex: from.length - 1 }
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

const squash = (value: string | null | undefined) => value?.replace(/[ \t\n\r]+/g, ' ').trim() ?? '';
const text = () => squash(document.body.textContent);
const cards = () => [...document.body.querySelectorAll<HTMLElement>('article')];
function card(name: string): HTMLElement {
  const found = cards().find((item) => item.querySelector('h2')?.textContent?.startsWith(name));
  if (!found) throw new Error(`No card «${name}»`);
  return found;
}
function button(scope: ParentNode, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((item) => squash(item.textContent) === label);
  if (!found) throw new Error(`No button «${label}»`);
  return found;
}
const done = () => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((item) => ['Готово', 'Отметьте хотя бы одну'].includes(squash(item.textContent)))!;

async function press(element: Element) {
  await act(async () => (element as HTMLElement).click());
  await settle();
}

describe('«Ревизия · начало»', () => {
  it('names the month and lists the candidates, largest first, with «Нужно / Лишнее» each', async () => {
    await renderAudit();

    expect(document.body.querySelector('h1')?.textContent).toBe('Ревизия сентября');
    expect(text()).toContain(`ИИ нашёл 6 трат, которые могут быть лишними, — 2${NB}319${NB}000${NB}сум за сентябрь. Отметьте: нужно или лишнее.`);
    expect(text()).toContain('Разобрано 0 из 6');
    expect(cards().map((item) => squash(item.querySelector('h2')?.textContent))).toEqual([
      `Доставка еды — 4${NB}раза`, 'Наушники', `Кофе — 16${NB}раз`, `Такси — 13${NB}раз`, 'Второй номер', 'Кинопоиск',
    ]);
    expect(squash(card('Доставка еды').textContent)).toContain('Стало чаще · Кафе');
    expect(card('Доставка еды').querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Нужна ли трата «Доставка еды»');
  });

  it('«Готово» waits for the first mark and says so', async () => {
    await renderAudit();

    expect(squash(done().textContent)).toBe('Отметьте хотя бы одну');
    expect(done().getAttribute('aria-disabled')).toBe('true');
    await press(done());
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('«Показать 16 операций» opens the newest five and «Показать все 16»', async () => {
    await renderAudit();

    await press(button(card('Кофе'), 'Показать 16 операций'));
    expect(card('Кофе').querySelectorAll('li')).toHaveLength(5);
    expect(button(card('Кофе'), 'Скрыть операции').getAttribute('aria-expanded')).toBe('true');
    await press(button(card('Кофе'), 'Показать все 16'));
    expect(card('Кофе').querySelectorAll('li')).toHaveLength(16);
  });
});

describe('marking («Ревизия · разобрано 2 из 6»)', () => {
  it('«Лишнее» is saved by the press and folds the card to its goal; the footer counts the saving', async () => {
    await renderAudit();

    await press(button(card('Кофе'), 'Лишнее'));

    expect(apiClient.patch).toHaveBeenCalledWith('/audits/audit-sep/candidates/coffee', { decision: 'extra' });
    const coffee = card('Кофе');
    expect(button(coffee, 'Лишнее').getAttribute('aria-pressed')).toBe('true');
    expect(squash(coffee.textContent)).not.toContain('В среднем');
    expect(squash(coffee.textContent)).toContain('Что делаем дальше');
    expect(squash(coffee.textContent)).toContain(`Лимит 224${NB}000${NB}сум в месяц · экономия 224${NB}000${NB}сум`);
    expect(text()).toContain(`Экономия 224${NB}000${NB}сум в месяц`);
    expect(text()).toContain('Лишнее: 1 из 6 · 5 разберёте позже');
    expect(text()).toContain('Разобрано 1 из 6');
    expect(squash(done().textContent)).toBe('Готово');
  });

  it('a second press takes the mark back', async () => {
    await renderAudit();
    await press(button(card('Доставка еды'), 'Нужно'));
    expect(squash(card('Доставка еды').textContent)).toContain('Предложим снова, только если трата заметно вырастет.');

    await press(button(card('Доставка еды'), 'Нужно'));

    expect(apiClient.patch).toHaveBeenLastCalledWith('/audits/audit-sep/candidates/delivery', { decision: null });
    expect(button(card('Доставка еды'), 'Нужно').getAttribute('aria-pressed')).toBe('false');
    expect(squash(card('Доставка еды').textContent)).toContain('В августе — 2');
  });

  it('«Отказаться» is the goal of the extra', async () => {
    await renderAudit();
    await press(button(card('Такси'), 'Лишнее'));

    await press(button(card('Такси'), 'Отказаться'));

    expect(apiClient.patch).toHaveBeenLastCalledWith('/audits/audit-sep/candidates/taxi', { goal: 'drop' });
    expect(squash(card('Такси').textContent)).toContain(`Экономия 349${NB}000${NB}сум в месяц`);
  });

  it('a mark that did not reach the server is taken back and the screen says so', async () => {
    await renderAudit();
    failNextMark = true;

    await press(button(card('Кофе'), 'Лишнее'));

    expect(button(card('Кофе'), 'Лишнее').getAttribute('aria-pressed')).toBe('false');
    expect(useUndoToastStore.getState().stack.at(-1)).toMatchObject({ kind: 'info', title: 'Отметка не сохранилась' });
  });
});

describe('«Готово» and the result («Ревизия · итог и цели»)', () => {
  it('shows the plan, the goals and what was needed, with the focus on the result', async () => {
    await renderAudit();
    for (const [name, label] of [['Кофе', 'Лишнее'], ['Такси', 'Лишнее'], ['Доставка еды', 'Лишнее'], ['Кинопоиск', 'Лишнее'], ['Наушники', 'Лишнее'], ['Второй номер', 'Нужно']]) {
      await press(button(card(name), label));
    }

    await press(done());

    expect(apiClient.post).toHaveBeenCalledWith('/audits/audit-sep/finish');
    expect(cards()).toHaveLength(0);
    const hero = document.body.querySelector<HTMLElement>('section[aria-label="Итог ревизии"] h2')!;
    expect(hero.textContent).toBe('Итог · отмечено 6 из 6');
    expect(document.activeElement).toBe(hero);
    expect(text()).toContain(`814${NB}000 сум в месяц`);
    expect(text()).toContain(`По этим тратам с 1 октября — 365${NB}400${NB}сум, за те же дни сентября — 774${NB}000${NB}сум: уже на 53% меньше`);
    expect(text()).toContain('Считаем с 14 октября — дня ревизии');
    expect(text()).toContain(`Потрачено 24${NB}000 из 102${NB}000${NB}сум до 31 октября`);
    expect(text()).toContain(`Наушники — 690${NB}000${NB}сум`);
    expect(text()).toContain('Цели появятся на главной, а у лимита напишем в боте. Следующая ревизия — 1 ноября, за октябрь.');
  });

  // The bot tells a limit at 80% and over it (FT-133) only while «Цели и подписки» is on
  it('does not promise the bot\'s message at the limit with «Цели и подписки» off', async () => {
    server = BOARD_DONE;
    settings = { ...SETTINGS, goalAlertsEnabled: false };
    await renderAudit();

    expect(text()).toContain('Цели появятся на главной. Следующая ревизия — 1 ноября, за октябрь.');
    expect(text()).not.toContain('напишем в боте');
  });

  it('«Изменить отметки» returns to the list; «Готово» again shows the result', async () => {
    server = BOARD_DONE;
    await renderAudit();

    await press(button(document.body, 'Изменить отметки'));
    expect(cards()).toHaveLength(6);
    expect(squash(done().textContent)).toBe('Готово');

    await press(done());
    expect(document.body.querySelector('section[aria-label="Итог ревизии"]')).not.toBeNull();
  });

  it('«Уже отменено» and «Напомнить» are saved on the subscription’s goal', async () => {
    server = BOARD_DONE;
    await renderAudit();

    await press(button(document.body, 'Напомнить 2 ноября'));
    expect(apiClient.patch).toHaveBeenLastCalledWith('/goals/goal-kinopoisk', { subscription: 'remind' });
    expect(text()).toContain('Напомним в боте 2 ноября. Следующее списание — 3 ноября.');
    expect(() => button(document.body, 'Напомнить 2 ноября')).toThrow();
    expect(document.body.querySelector('p[role="status"]')?.textContent).toBe('Напомним про «Кинопоиск» 2 ноября');

    await press(button(document.body, 'Уже отменено'));
    expect(apiClient.patch).toHaveBeenLastCalledWith('/goals/goal-kinopoisk', { subscription: 'cancelled' });
    expect(text()).toContain('Отменено — больше не спишут');
    expect(() => button(document.body, 'Уже отменено')).toThrow();
  });

  it('«На главную» after «Напомнить» shows «Цели после ревизии» on Home, read again since Home had none', async () => {
    // Home as the app keeps it: its reads stay fresh for 5 minutes, and it read the goals while the audit was open
    await renderAudit(['/'], { home: <AuditCard />, staleTime: 5 * 60_000 });
    const invite = document.body.querySelector<HTMLAnchorElement>('a[href="/audit"]')!;
    expect(squash(invite.textContent)).toContain('Ревизия сентября');

    await press(invite);
    await press(button(card('Кофе'), 'Лишнее'));
    await press(button(card('Кинопоиск'), 'Лишнее'));
    await press(done());
    vi.mocked(apiClient.get).mockClear();
    await press(button(document.body, 'Напомнить 2 ноября'));
    await press([...document.body.querySelectorAll('a')].find((link) => link.textContent === 'На главную')!);

    expect(router.state.location.pathname).toBe('/');
    expect(apiClient.get).toHaveBeenCalledWith('/goals');
    const goals = document.body.querySelector<HTMLAnchorElement>('a[href="/audit"]');
    expect(squash(goals?.textContent)).toBe(`Цели после ревизии4 цели · экономия до 814${NB}000${NB}сум`);
  });

  it('«На главную» opens Home', async () => {
    server = BOARD_DONE;
    await renderAudit(['/more', '/audit']);

    await press([...document.body.querySelectorAll('a')].find((link) => link.textContent === 'На главную')!);

    expect(router.state.location.pathname).toBe('/');
  });
});

describe('other states', () => {
  it('«Ревизия · мало данных»: when the first audit comes', async () => {
    server = EARLY;
    await renderAudit();

    expect(document.body.querySelector('h1')?.textContent).toBe('Ревизия трат');
    expect(text()).toContain('Первая ревизия — 1 декабря');
    expect(text()).toContain('Нужен целый месяц записей');
    expect(text()).toContain('Записей пока — за 3 дня, а нужен целый ноябрь');
    expect(cards()).toHaveLength(0);
  });

  it('«Ревизия · лишнего нет» when nothing was found', async () => {
    server = { ...BOARD_OPEN, candidates: [], summary: { ...BOARD_OPEN.summary, count: 0, left: 0, totalMinor: 0 } };
    await renderAudit();

    expect(text()).toContain('Лишнего не нашлось');
    expect(text()).toContain('Траты сентября обычные');
    expect(() => button(document.body, 'Изменить отметки')).toThrow();
  });
});
