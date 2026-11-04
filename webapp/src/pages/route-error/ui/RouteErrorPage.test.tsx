// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadHere, reloadHome } from '../model/reload';
import { RouteErrorPage } from './RouteErrorPage';

/**
 * #240, boards «Что-то пошло не так» and «Что-то пошло не так · тёмная»: a screen that did not open — its code did not
 * load (often right after an update) or it fell while drawing — is ProblemScreen in its `centered` view with the
 * Kapelka sign in the header: an arrow in a circle, «Экран не открылся», that the records are safe, «Обновить» and
 * under it the link «На главную». No emoji, no technical text. Rendered here without a router: the app's top error
 * boundary shows it outside the router.
 */

vi.mock('../model/reload', () => ({ reloadHere: vi.fn(), reloadHome: vi.fn() }));

const TITLE = 'Экран не открылся';
const TEXT = 'Записи на месте. Нажмите «Обновить» — обычно это помогает.';

let root: Root;
let container: HTMLDivElement;

const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
const buttons = () => [...container.querySelectorAll('button')];

function button(name: string): HTMLButtonElement {
  const found = buttons().find((candidate) => squash(candidate.textContent) === name);
  if (!found) throw new Error(`No button «${name}»; the screen says: ${squash(container.textContent)}`);
  return found;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(reloadHere).mockReset();
  vi.mocked(reloadHome).mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<RouteErrorPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the screen that did not open', () => {
  it('says so and that the records are safe, under the Kapelka sign', () => {
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(squash(container.querySelector('h1')?.textContent)).toBe(TITLE);
    expect(squash(container.querySelector('h1 + p')?.textContent)).toBe(TEXT);
    expect(squash(container.textContent)).toContain('kapelka');
  });

  it('offers «Обновить» and under it the underlined link «На главную»', () => {
    expect(buttons().map((candidate) => squash(candidate.textContent))).toEqual(['Обновить', 'На главную']);
    expect(button('На главную').className).toContain('underline');
  });

  it('has no emoji', () => {
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('draws the arrow in a circle as a line icon in the text colour', () => {
    const icon = container.querySelector('h1')?.previousElementSibling;
    const line = icon?.querySelector('svg path');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(line?.getAttribute('d')).toBe('M20.5 12a8.5 8.5 0 1 1-2.49-6.01L20.5 8.5M20.5 3.5v5h-5');
    expect(line?.getAttribute('stroke')).toBe('currentColor');
    expect(line?.getAttribute('stroke-width')).toBe('1.8');
  });

  it('«Обновить» loads the app again at this address', async () => {
    await act(async () => button('Обновить').click());

    expect(reloadHere).toHaveBeenCalledTimes(1);
    expect(reloadHome).not.toHaveBeenCalled();
  });

  it('«На главную» loads the app again on Home', async () => {
    await act(async () => button('На главную').click());

    expect(reloadHome).toHaveBeenCalledTimes(1);
    expect(reloadHere).not.toHaveBeenCalled();
  });
});
