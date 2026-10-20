// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useParams, useSearchParams } from 'react-router-dom';
import type { MonthAnalytics } from '@/entities/analytics';
import type { Category } from '@/entities/category';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { EMPTY, OCTOBER_EXPENSES, OCTOBER_INCOME, SEPTEMBER_EXPENSES } from '../model/fixtures';
import { AnalyticsPage } from './AnalyticsPage';

/**
 * FT-121, boards «Аналитика · расходы», «Аналитика · доходы», «Аналитика · прошлый месяц», «Аналитика · пока
 * пусто»: the screen reads GET /api/analytics for the month and the side in its address, shows the total with its
 * insight and the categories as bars; the stepper and «Расходы / Доходы» change the address, a category opens its
 * own screen. Rendered in jsdom with the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) } };
});

const USER_ID = '900000001';

const category = (id: string, name: string, color: Category['color'], type: Category['type'] = 'expense'): Category => ({
  id, name, color, type, isHidden: false, isOther: false, sortOrder: 0, presetKey: null,
});
const CATEGORIES = [
  category('pr', 'Продукты', 'peach'),
  category('dm', 'Дом', 'sand'),
  category('kf', 'Кафе', 'rose'),
  category('zd', 'Здоровье', 'mint'),
  category('zp', 'Зарплата', 'mint', 'income'),
  category('fr', 'Фриланс', 'lilac', 'income'),
];

let answers: Record<string, MonthAnalytics | Error>;
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

function CategoryStub() {
  const { id } = useParams();
  const [params] = useSearchParams();
  return <p>Категория {id} за {params.get('month')}</p>;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  answers = {
    '/analytics?type=expense': OCTOBER_EXPENSES,
    '/analytics?type=income': OCTOBER_INCOME,
    '/analytics?month=2026-09&type=expense': SEPTEMBER_EXPENSES,
  };
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/categories') return { success: true, data: CATEGORIES } as never;
    const answer = answers[url];
    if (answer instanceof Error) throw { message: answer.message, statusCode: (answer as Error & { statusCode?: number }).statusCode ?? 500 };
    if (answer) return { success: true, data: answer } as never;
    return new Promise<never>(() => {});
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAnalytics(path = '/analytics') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/analytics', element: <AnalyticsPage /> },
      { path: '/analytics/categories/:id', element: <CategoryStub /> },
      { path: '/add', element: <p>Ручной ввод</p> },
      { path: '/', element: <p>Главная</p> },
    ],
    { initialEntries: [path] }
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

async function settle() {
  for (let step = 0; step < 3; step++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const text = () => document.body.textContent?.replace(/[\s\u00a0]+/g, ' ') ?? '';
const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>('button')];
function button(name: string | RegExp): HTMLButtonElement {
  const matches = (value: string | null | undefined) => (typeof name === 'string' ? value?.replace(/\u00a0/g, ' ') === name : !!value && name.test(value.replace(/\u00a0/g, ' ')));
  const found = buttons().find((item) => matches(item.getAttribute('aria-label')) || matches(item.textContent?.trim()));
  if (!found) throw new Error(`No button «${name}» among: ${buttons().map((item) => item.getAttribute('aria-label') ?? item.textContent?.trim()).join(' | ')}`);
  return found;
}
async function press(name: string | RegExp) {
  await act(async () => button(name).click());
  await settle();
}
const location = () => `${router.state.location.pathname}${router.state.location.search}`;

describe('Analytics: expenses of the current month (board «Аналитика · расходы»)', () => {
  it('shows the month, the total with its comparison and insight, and the categories with their change', async () => {
    await renderAnalytics();

    expect(document.body.querySelector('h1')?.textContent).toBe('Аналитика');
    expect(text()).toContain('Октябрь 2026');
    expect(text()).toContain('Расходы · 1–14 октября');
    expect(text()).toContain('7 684 400 сум');
    expect(text()).toContain('↑ 10% к 1–14 сентября · на 714 400 сум больше');
    expect(text()).toContain('Кафе: на 312 000 сум больше, чем за 1–14 сентября');
    expect(text()).toContain('По категориям');
    expect(text()).toContain('было за 1–14 сентября');
    expect(button('Кафе: 1 092 000 сум, 14% расходов, на 40% больше, чем за 1–14 сентября. Открыть')).toBeTruthy();
    expect(text()).toContain('как было');
    expect(text()).toContain('новое');
    expect(text()).toContain('Нажмите на категорию, чтобы увидеть операции.');
    expect(button('Расходы').getAttribute('aria-pressed')).toBe('true');
  });

  it('reads only the new analytics: the old dashboard is not called', async () => {
    await renderAnalytics();

    const urls = vi.mocked(apiClient.get).mock.calls.map(([url]) => url);
    expect(urls).toContain('/analytics?type=expense');
    expect(urls.some((url) => url.startsWith('/dashboard') || url.startsWith('/transactions/analytics'))).toBe(false);
  });

  it('a category opens its own screen for the month shown', async () => {
    await renderAnalytics();

    await press(/^Кафе: /);

    expect(location()).toBe('/analytics/categories/kf?month=2026-10');
    expect(text()).toContain('Категория kf за 2026-10');
  });

  it('the stepper goes to the previous month, and not past the current one', async () => {
    await renderAnalytics();
    expect(button('Следующий месяц').disabled).toBe(true);

    await press('Предыдущий месяц');

    expect(location()).toBe('/analytics?month=2026-09');
    expect(text()).toContain('Сентябрь 2026');
    expect(text()).toContain('Расходы · сентябрь');
    expect(text()).toContain('Почти как в августе · на 40 000 сум меньше');
    expect(button('Следующий месяц').disabled).toBe(false);
  });

  it('forward to the current month: the address loses its month, the stepper names it while it loads', async () => {
    await renderAnalytics('/analytics?month=2026-09');
    expect(text()).toContain('Расходы · сентябрь');
    delete answers['/analytics?type=expense'];

    await press('Следующий месяц');

    expect(location()).toBe('/analytics');
    expect(text()).toContain('Октябрь 2026');
    expect(text()).toContain('Загружаю аналитику…');
    expect(text()).not.toContain('Расходы · сентябрь');
  });

  it('«Доходы» shows the income of the same month', async () => {
    await renderAnalytics();

    await press('Доходы');

    expect(location()).toBe('/analytics?type=income');
    expect(button('Доходы').getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain('Доходы · 1–14 октября');
    expect(text()).toContain('≈ 16 295 000');
    expect(text()).toContain('За весь сентябрь — 15 210 000 сум');
    expect(text()).toContain('пока нет');
    expect(text()).toContain('Доллары пересчитаны по курсу ЦБ: 1 USD = 12 650 сум.');
  });

  it('opened with the income in its address (Home’s income tile)', async () => {
    await renderAnalytics('/analytics?type=income');

    expect(text()).toContain('Фриланс: на 1 265 000 сум больше, чем в сентябре');
  });
});

describe('Analytics: nothing yet (board «Аналитика · пока пусто»)', () => {
  it('says the month is empty and leads to the first record; one month, no stepper', async () => {
    answers['/analytics?type=expense'] = EMPTY;
    await renderAnalytics();

    expect(text()).toContain('В октябре пока нет расходов');
    expect(text()).toContain('Запишите первую трату — аналитика появится сразу, а выводы через неделю.');
    const write = [...document.body.querySelectorAll('a')].find((link) => link.textContent === 'Записать трату');
    expect(write?.getAttribute('href')).toBe('/add');
    expect(buttons().some((item) => item.getAttribute('aria-label') === 'Предыдущий месяц')).toBe(false);
    expect(text()).not.toContain('По категориям');
  });

  it('an empty month of income leads to an income: manual entry opens on «Доход»', async () => {
    answers['/analytics?type=income'] = { ...EMPTY, type: 'income' };
    await renderAnalytics('/analytics?type=income');

    expect(text()).toContain('В октябре пока нет доходов');
    const write = [...document.body.querySelectorAll('a')].find((link) => link.textContent === 'Записать доход');
    expect(write?.getAttribute('href')).toBe('/add?type=income');
  });
});

describe('Analytics: a read that failed, a guest', () => {
  it('a failed read says so and reads again', async () => {
    answers['/analytics?type=expense'] = new Error('boom');
    await renderAnalytics();

    expect(text()).toContain('Не удалось загрузить аналитику.');
    answers['/analytics?type=expense'] = OCTOBER_EXPENSES;
    await press('Попробовать снова');
    expect(text()).toContain('Расходы · 1–14 октября');
  });

  it('a month later than the current one (a link, a clock ahead) is refused: the screen goes to the current month', async () => {
    answers['/analytics?month=2030-01&type=income'] = Object.assign(new Error('month must not be after the current month'), { statusCode: 400 });
    await renderAnalytics('/analytics?month=2030-01&type=income');

    expect(router.state.location.pathname).toBe('/analytics');
    expect(router.state.location.search).toBe('?type=income');
    expect(text()).not.toContain('Не удалось загрузить аналитику.');
    expect(text()).toContain('Доходы · 1–14 октября');
    expect(button('Предыдущий месяц')).toBeTruthy();
  });

  it('a guest is asked to sign in: analytics is counted on the server', async () => {
    useUserStore.setState({ userId: 'guest-1', userType: 'guest', telegramId: null, userName: null });
    await renderAnalytics();

    expect(text()).toContain('Аналитика — после входа');
    expect(vi.mocked(apiClient.get).mock.calls.some(([url]) => url.startsWith('/analytics'))).toBe(false);
  });
});
