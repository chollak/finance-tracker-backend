// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadHere, reloadHome } from '@/pages/route-error/model/reload';
import { AppProviders } from './index';

/**
 * #240: when the app falls outside the router — in a provider around it — the top error boundary shows the same
 * «Экран не открылся» as the router does: no shadcn card, no error text in monospace. The failure goes to the log.
 */

const FAILURE = 'QuotaExceededError: The quota has been exceeded.';

vi.mock('@/shared/api/client', () => {
  const pending = () => new Promise<never>(() => {});
  return { apiClient: { get: vi.fn(pending), post: vi.fn(pending), put: vi.fn(pending), patch: vi.fn(pending), delete: vi.fn(pending) }, onSessionLost: vi.fn() };
});

// The first provider inside the boundary falls while drawing
vi.mock('./ThemeController', () => ({
  ThemeController: (): never => {
    throw new Error('QuotaExceededError: The quota has been exceeded.');
  },
}));

vi.mock('@/pages/route-error/model/reload', () => ({ reloadHere: vi.fn(), reloadHome: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
let logged: ReturnType<typeof vi.spyOn>;

const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((candidate) => squash(candidate.textContent) === name);
  if (!found) throw new Error(`No button «${name}»; the screen says: ${squash(container.textContent)}`);
  return found;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(reloadHere).mockReset();
  vi.mocked(reloadHome).mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <AppProviders>
        <p>the app</p>
      </AppProviders>
    )
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  logged.mockRestore();
});

describe('the app falls outside the router', () => {
  it('shows «Экран не открылся» with «Обновить» and «На главную»', () => {
    expect(squash(container.querySelector('h1')?.textContent)).toBe('Экран не открылся');
    expect([...container.querySelectorAll('button')].map((candidate) => squash(candidate.textContent))).toEqual([
      'Обновить',
      'На главную',
    ]);
    expect(container.textContent).not.toContain('the app');
  });

  it('keeps the failure off the screen and puts it in the log', () => {
    expect(container.textContent).not.toContain(FAILURE);
    expect(container.querySelector('.font-mono')).toBeNull();
    const failures = logged.mock.calls.flat().filter((argument: unknown) => argument instanceof Error);
    expect(failures.map((failure: Error) => failure.message)).toContain(FAILURE);
  });

  it('«Обновить» loads the app again at this address, «На главную» on Home', async () => {
    await act(async () => button('Обновить').click());
    expect(reloadHere).toHaveBeenCalledTimes(1);

    await act(async () => button('На главную').click());
    expect(reloadHome).toHaveBeenCalledTimes(1);
  });
});
