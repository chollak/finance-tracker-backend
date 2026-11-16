// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniAppReopenPage } from './MiniAppReopenPage';

/**
 * #316: inside Telegram the server stopped taking the Mini App's initData — it lives 24 hours, and Telegram renews it
 * only when the Mini App is opened again. ProblemScreen in its `centered` view with the Kapelka sign, as «Такой
 * страницы нет» and «Экран не открылся»: a clock, «Откройте Kapelka заново», what to do and that the records are safe,
 * and one way out that surely works — «Закрыть Kapelka», which closes the Mini App (`Telegram.WebApp.close()`).
 * Opening it again cannot be done from the page.
 */

const TITLE = 'Откройте Kapelka заново';
const TEXT = 'Kapelka была открыта слишком долго. Закройте её и откройте снова из чата с ботом — записи на месте, а те, что ждут отправки, уйдут сами.';

let root: Root;
let container: HTMLDivElement;
let close: ReturnType<typeof vi.fn>;

const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
const buttons = () => [...container.querySelectorAll('button')];

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  close = vi.fn();
  vi.stubGlobal('Telegram', { WebApp: { initData: 'query_id=1&hash=abc', close } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MiniAppReopenPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('the screen that asks to open Kapelka again', () => {
  it('says what happened and what to do, and that the records are safe, under the Kapelka sign', () => {
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(squash(container.querySelector('h1')?.textContent)).toBe(TITLE);
    expect(squash(container.querySelector('h1 + p')?.textContent)).toBe(TEXT);
    expect(squash(container.textContent)).toContain('kapelka');
  });

  it('has one way out, a verb: «Закрыть Kapelka» — no «Попробовать снова», a repeat gets the same refusal', () => {
    expect(buttons().map((candidate) => squash(candidate.textContent))).toEqual(['Закрыть Kapelka']);
  });

  it('«Закрыть Kapelka» closes the Mini App', async () => {
    await act(async () => buttons()[0].click());

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('has no emoji and no technical words', () => {
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(container.textContent).not.toMatch(/ошибк|401|initData|токен/i);
  });

  it('draws a clock as a line icon in the text colour', () => {
    const icon = container.querySelector('h1')?.previousElementSibling;
    const line = icon?.querySelector('svg path');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(line?.getAttribute('d')).toBe('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2');
    expect(line?.getAttribute('stroke')).toBe('currentColor');
    expect(line?.getAttribute('stroke-width')).toBe('1.8');
  });
});
