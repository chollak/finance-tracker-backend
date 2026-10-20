// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { GUEST_CATEGORIES, type Category } from '@/entities/category';
import { useUserStore } from '@/entities/user';
import { apiClient } from '@/shared/api';
import { useUndoToastStore } from '@/shared/lib/undo';
import { CategoriesPage } from './CategoriesPage';

/**
 * FT-127, boards «Категории», «Категория «Кафе»», «Новая категория», «Скрытые категории», «Категории · тёмная»,
 * «Категории в браузере»: rename, one of 8 colours, hide — applied when the sheet closes, with a toast and «Отменить»;
 * a new category; a taken name said plainly; «Другое» is never hidden. Rendered in jsdom with the API answered here.
 */

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return {
    apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending), getFile: vi.fn(pending) },
  };
});

const USER_ID = '900000001';

let categories: Category[];
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;

const START: Category[] = GUEST_CATEGORIES.map((category, index) => ({ ...category, id: `c${index}` }));
const idOf = (name: string, type: Category['type'] = 'expense') => START.find((c) => c.name === name && c.type === type)!.id;

/** «8 записей в октябре»: the month's analytics, as the analytics screen reads it. */
function analytics(type: string) {
  const rows: Array<[string, number]> =
    type === 'income'
      ? [[idOf('Зарплата', 'income'), 1]]
      : [
          [idOf('Продукты'), 8],
          [idOf('Кафе'), 10],
          [idOf('Транспорт'), 12],
          [idOf('Покупки'), 3],
        ];
  return { month: '2026-10', type, categories: rows.map(([categoryId, count]) => ({ categoryId, count })) };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  categories = START;
  vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/categories') return { success: true, data: categories } as never;
    const month = /^\/analytics\?type=(expense|income)$/.exec(url);
    if (month) return { success: true, data: analytics(month[1]) } as never;
    return new Promise<never>(() => {});
  });
  vi.mocked(apiClient.get).mockClear();
  vi.mocked(apiClient.patch).mockReset();
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.delete).mockReset();
  vi.mocked(apiClient.patch).mockImplementation(async (url: string, patch: unknown) => {
    const id = url.split('/').pop();
    categories = categories.map((c) => (c.id === id ? { ...c, ...(patch as Partial<Category>) } : c));
    return { success: true, data: categories.find((c) => c.id === id) } as never;
  });
  vi.mocked(apiClient.post).mockImplementation(async (_url: string, body: unknown) => {
    const created: Category = { ...(body as Pick<Category, 'type' | 'name' | 'color'>), id: 'new1', isHidden: false, isOther: false, sortOrder: 90, presetKey: null };
    categories = [...categories, created];
    return { success: true, data: created } as never;
  });
  vi.mocked(apiClient.delete).mockImplementation(async (url: string) => {
    const id = url.split('/').pop();
    categories = categories.filter((c) => c.id !== id);
    return { success: true, data: { id } } as never;
  });
  useUserStore.setState({ userId: USER_ID, userType: 'telegram', telegramId: USER_ID, userName: 'Шукур' });
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

async function renderCategories() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router = createMemoryRouter(
    [
      { path: '/more', element: <p>Ещё</p> },
      { path: '/more/categories', element: <CategoriesPage /> },
    ],
    { initialEntries: ['/more', '/more/categories'], initialIndex: 1 }
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
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const squash = (value: string | null | undefined) => value?.replace(/[ \t\n\r]+/g, ' ').trim() ?? '';
const sheet = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
/** The words of an element as one reads them: each piece of text apart. */
const words = (element: Element | null | undefined) =>
  element
    ? [...element.querySelectorAll('*')]
        .filter((node) => node.children.length === 0 && squash(node.textContent))
        .map((node) => squash(node.textContent))
        .join(' ')
    : '';
const toast = () => words(document.body.querySelector('[role="status"][aria-live="polite"]'));

/** The rows of the list as «name · caption», «Добавить категорию» and «Скрытые · N» included. */
function rows(): string[] {
  const list = document.body.querySelector('section[aria-label^="Категории"]')!;
  return [...list.querySelectorAll(':scope > button')].map((row) =>
    [...row.querySelectorAll('[data-row-text] > span')].length > 0
      ? [...row.querySelectorAll('[data-row-text] > span')].map((part) => squash(part.textContent)).join(' · ')
      : squash(row.textContent)
  );
}

function button(name: string, scope: ParentNode = document.body): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === name || squash(item.textContent) === name || item.getAttribute('aria-label')?.startsWith(`${name},`)
  );
  if (!found) throw new Error(`No button «${name}»`);
  return found;
}

async function press(element: Element) {
  await act(async () => (element as HTMLElement).click());
  await settle();
}

async function type(value: string) {
  const input = sheet()!.querySelector<HTMLInputElement>('input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function escape() {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await settle();
}

describe('«Категории»', () => {
  it('lists the expense categories with their records this month, «Другое» last; «Доходы» shows the income ones', async () => {
    await renderCategories();

    expect(document.body.querySelector('h1')?.textContent).toBe('Категории');
    expect(button('Расходы').getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toEqual([
      'Продукты · 8 записей в октябре',
      'Кафе · 10 записей в октябре',
      'Транспорт · 12 записей в октябре',
      'Дом · В октябре не было',
      'Связь · В октябре не было',
      'Здоровье · В октябре не было',
      'Покупки · 3 записи в октябре',
      'Другое · В октябре не было',
      'Добавить категорию',
    ]);
    expect(squash(document.body.textContent)).toContain(
      'ИИ раскладывает записи по этим категориям. Новую он начнёт предлагать по её названию — так что лучше называть просто: «Спорт», «Дети».'
    );

    await press(button('Доходы'));

    expect(rows()[0]).toBe('Зарплата · 1 запись в октябре');
    expect(rows().at(-2)).toBe('Другое · В октябре не было');
  });

  it('«Назад» returns to «Ещё»', async () => {
    await renderCategories();

    await press(button('Назад в «Ещё»'));

    expect(router.state.location.pathname).toBe('/more');
  });
});

describe('«Категория «Кафе»»: the edit applies when the sheet closes', () => {
  it('a new name and colour are saved on «Закрыть», with «Категория изменена · Кафе → Кофейни» and «Отменить»', async () => {
    await renderCategories();

    await press(button('Кафе'));
    expect(sheet()?.querySelector('h2')?.textContent).toBe('Категория «Кафе»');
    expect(sheet()!.querySelector('input')!.value).toBe('Кафе');
    const swatches = [...sheet()!.querySelectorAll('[role="radio"]')];
    expect(swatches.map((swatch) => swatch.getAttribute('aria-label'))).toEqual(['Персиковый', 'Розовый', 'Голубой', 'Песочный', 'Сиреневый', 'Мятный', 'Жёлтый', 'Серый']);
    expect(swatches.find((swatch) => swatch.getAttribute('aria-checked') === 'true')?.getAttribute('aria-label')).toBe('Розовый');

    await type('Кофейни');
    expect(squash(sheet()?.textContent)).toContain('Все 10 записей за октябрь и прошлые получат новое название.');
    await press(button('Жёлтый', sheet()!));
    expect(apiClient.patch).not.toHaveBeenCalled();

    await press(button('Закрыть', sheet()!));

    expect(sheet()).toBeNull();
    expect(apiClient.patch).toHaveBeenCalledWith(`/categories/${idOf('Кафе')}`, { name: 'Кофейни', color: 'butter' });
    expect(rows()[1]).toBe('Кофейни · 10 записей в октябре');
    expect(toast()).toBe('Категория изменена Кафе → Кофейни Отменить');

    await press(button('Отменить'));

    expect(apiClient.patch).toHaveBeenLastCalledWith(`/categories/${idOf('Кафе')}`, { name: 'Кафе', color: 'rose' });
    expect(rows()[1]).toBe('Кафе · 10 записей в октябре');
  });

  it('«Готово» closes and saves too; only a new colour says «новый цвет»', async () => {
    await renderCategories();

    await press(button('Кафе'));
    await press(button('Голубой', sheet()!));
    await press(button('Готово', sheet()!));

    expect(sheet()).toBeNull();
    expect(apiClient.patch).toHaveBeenCalledWith(`/categories/${idOf('Кафе')}`, { color: 'sky' });
    expect(toast()).toBe('Категория изменена Кафе · новый цвет Отменить');
  });

  it('closing with nothing changed writes nothing', async () => {
    await renderCategories();

    await press(button('Кафе'));
    await escape();

    expect(sheet()).toBeNull();
    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(toast()).toBe('');
  });

  it('a taken name: the button says so, and closing saves nothing and says why', async () => {
    await renderCategories();

    await press(button('Кафе'));
    await type('продукты');
    const done = button('Такая категория уже есть', sheet()!);
    expect(done.disabled).toBe(true);

    await escape();

    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(toast()).toBe('Не сохранено Категория «Продукты» уже есть');
  });

  it('a name the server finds taken (another device added it) is not saved, and the toast says so', async () => {
    vi.mocked(apiClient.patch).mockRejectedValueOnce({ message: 'Conflict', statusCode: 409 });
    await renderCategories();

    await press(button('Кафе'));
    await type('Кофе');
    await press(button('Готово', sheet()!));

    expect(toast()).toBe('Не сохранено Категория «Кофе» уже есть');
    expect(rows()[1]).toBe('Кафе · 10 записей в октябре');
  });

  it('«Скрыть категорию»: it leaves the list for «Скрытые», with «Отменить»', async () => {
    await renderCategories();

    await press(button('Кафе'));
    expect(squash(sheet()?.textContent)).toContain('Все записи с ней останутся в истории и аналитике. В выборе её не будет; вернуть — «Скрытые» внизу списка.');
    await press(button('Скрыть категорию', sheet()!));

    expect(sheet()).toBeNull();
    expect(apiClient.patch).toHaveBeenCalledWith(`/categories/${idOf('Кафе')}`, { isHidden: true });
    expect(rows()).not.toContain('Кафе · 10 записей в октябре');
    expect(rows().at(-1)).toBe('Скрытые · 1');
    expect(toast()).toBe('Категория скрыта Кафе · вернуть — «Скрытые» Отменить');

    await press(button('Отменить'));

    expect(apiClient.patch).toHaveBeenLastCalledWith(`/categories/${idOf('Кафе')}`, { isHidden: false });
    expect(rows()[1]).toBe('Кафе · 10 записей в октябре');
    expect(rows().at(-1)).toBe('Добавить категорию');
  });

  it('«Другое» has no «Скрыть категорию» — it says why', async () => {
    await renderCategories();

    await press(button('Другое'));

    expect(() => button('Скрыть категорию', sheet()!)).toThrow();
    expect(squash(sheet()?.textContent)).toContain('«Другое» нельзя скрыть: сюда попадает всё, что ИИ не смог разложить.');
  });
});

describe('«Новая категория»', () => {
  it('only the button adds it: a taken name is said on the button; «Отменить» takes it back', async () => {
    await renderCategories();

    await press(button('Добавить категорию'));
    expect(sheet()?.querySelector('h2')?.textContent).toBe('Новая категория расхода');
    expect(button('Введите название', sheet()!).disabled).toBe(true);
    await type('кафе');
    expect(button('Такая категория уже есть', sheet()!).disabled).toBe(true);
    await type('Спорт');
    await press(button('Голубой', sheet()!));
    await press(button('Добавить категорию расхода', sheet()!));

    expect(apiClient.post).toHaveBeenCalledWith('/categories', { type: 'expense', name: 'Спорт', color: 'sky' });
    expect(sheet()).toBeNull();
    expect(rows()).toContain('Спорт · В октябре не было');
    expect(rows().indexOf('Спорт · В октябре не было')).toBe(rows().indexOf('Другое · В октябре не было') - 1);
    expect(toast()).toBe('Категория добавлена Спорт · ИИ начнёт предлагать её Отменить');

    await press(button('Отменить'));

    expect(apiClient.delete).toHaveBeenCalledWith('/categories/new1');
    expect(rows()).not.toContain('Спорт · В октябре не было');
  });

  it('closing the sheet adds nothing; a name taken by a hidden one says to bring it back', async () => {
    categories = START.map((c) => (c.name === 'Покупки' ? { ...c, isHidden: true } : c));
    await renderCategories();

    await press(button('Добавить категорию'));
    await type('Покупки');
    expect(button('Такая есть в скрытых — верните её', sheet()!).disabled).toBe(true);
    await type('Дети');
    await escape();

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(rows()).not.toContain('Дети · В октябре не было');
  });

  it('a failed add keeps the sheet open with what was typed and says why', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({ message: 'Network', statusCode: 0 });
    await renderCategories();

    await press(button('Добавить категорию'));
    await type('Спорт');
    await press(button('Добавить категорию расхода', sheet()!));

    expect(sheet()).not.toBeNull();
    expect(sheet()!.querySelector('input')!.value).toBe('Спорт');
    expect(squash(sheet()!.querySelector('[role="alert"]')?.textContent)).toBe('Не получилось добавить. Проверьте связь и нажмите ещё раз');
  });
});

describe('«Скрытые категории»', () => {
  it('«Показать» brings it back into the choice; with none left the sheet closes; «Отменить» hides it again', async () => {
    categories = START.map((c) => (c.name === 'Покупки' ? { ...c, isHidden: true } : c));
    await renderCategories();

    expect(rows()).not.toContain('Покупки · 3 записи в октябре');
    await press(button('Скрытые · 1'));
    expect(sheet()?.querySelector('h2')?.textContent).toBe('Скрытые категории');
    expect(words(sheet()?.querySelector('li'))).toBe('П Покупки 3 записи в октябре Показать');
    expect(squash(sheet()?.textContent)).toContain('Скрытых категорий нет в выборе, и ИИ их не предлагает. Старые записи с ними остаются в истории и аналитике.');

    await press(button('Показать категорию «Покупки»', sheet()!));

    expect(apiClient.patch).toHaveBeenCalledWith(`/categories/${idOf('Покупки')}`, { isHidden: false });
    expect(sheet()).toBeNull();
    expect(rows()).toContain('Покупки · 3 записи в октябре');
    expect(toast()).toBe('Категория снова в выборе Покупки Отменить');

    await press(button('Отменить'));

    expect(apiClient.patch).toHaveBeenLastCalledWith(`/categories/${idOf('Покупки')}`, { isHidden: true });
    expect(rows().at(-1)).toBe('Скрытые · 1');
  });
});

describe('a guest', () => {
  it('has no categories of their own to change: the screen says they come after signing in', async () => {
    useUserStore.setState({ userId: 'guest_1', userType: 'guest', telegramId: null, userName: null });
    await renderCategories();

    expect(squash(document.body.textContent)).toContain('Категории — после входа');
    expect(apiClient.get).not.toHaveBeenCalledWith('/categories');
  });
});
