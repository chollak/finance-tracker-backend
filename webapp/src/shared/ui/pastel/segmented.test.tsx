// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pastelColors, type PastelColorName } from '@/shared/config/pastelTokens';
import { Segmented } from './segmented';

/**
 * Segmented.md: two segments with `aria-pressed` in a named group. A segment that cannot be chosen right now
 * («USD» without a rate, FT-137) stays in its place, dimmed and announced as unavailable, and pressing it
 * asks the screen to say why instead of choosing it.
 */

let root: Root | null = null;
let container: HTMLDivElement;

const onChange = vi.fn();
const onUnavailable = vi.fn();

function render(usdUnavailable: boolean, inSheet = false, strong = false): void {
  root = createRoot(container);
  act(() => {
    root!.render(
      <Segmented
        inSheet={inSheet}
        strong={strong}
        ariaLabel="Валюта отображения"
        value="UZS"
        onChange={onChange}
        onUnavailable={onUnavailable}
        options={[
          { value: 'UZS', label: 'Сум' },
          { value: 'USD', label: 'USD', unavailable: usdUnavailable, ariaLabel: usdUnavailable ? 'USD — курса доллара пока нет' : undefined },
        ]}
      />
    );
  });
}

const segment = (label: string) =>
  [...container.querySelectorAll('button')].find((button) => button.textContent === label) as HTMLButtonElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  onChange.mockReset();
  onUnavailable.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('Segmented', () => {
  it('names the group and marks the chosen segment', () => {
    render(false);

    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Валюта отображения');
    expect(segment('Сум').getAttribute('aria-pressed')).toBe('true');
    expect(segment('USD').getAttribute('aria-pressed')).toBe('false');

    act(() => segment('USD').click());
    expect(onChange).toHaveBeenCalledWith('USD');
  });

  it('keeps an unavailable segment in reach, announced as unavailable with its reason', () => {
    render(true);
    const usd = segment('USD');

    expect(usd.getAttribute('aria-disabled')).toBe('true');
    expect(usd.disabled).toBe(false); // still focusable, so the reason can be heard
    expect(usd.getAttribute('aria-label')).toBe('USD — курса доллара пока нет');
    expect(usd.className).toContain('opacity-35');
  });

  it('asks to explain instead of choosing when an unavailable segment is pressed', () => {
    render(true);

    act(() => segment('USD').click());

    expect(onChange).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledWith('USD');
  });

  /** The colour token a `bg-<token>` class of the element paints with. */
  const background = (element: Element): PastelColorName => {
    const names = [...element.classList].filter((name) => name.startsWith('bg-')).map((name) => name.slice(3));
    const tokens = names.filter((name): name is PastelColorName => name in pastelColors.light);
    expect(tokens).toHaveLength(1);
    return tokens[0];
  };

  it.each([false, true])('shows the chosen segment as a knob on its track in both themes (in a sheet: %s)', (inSheet) => {
    render(false, inSheet);
    const track = background(container.querySelector('[role="group"]')!);
    const knob = background(segment('Сум'));

    for (const theme of ['light', 'dark'] as const) {
      expect(pastelColors[theme][knob]).not.toBe(pastelColors[theme][track]);
    }
  });

  it('in a sheet draws the knob as the boards do (FT-141): sheet-track with a card knob', () => {
    render(false, true);

    // «Курс доллара», «Новый счёт», «Изменить или скрыть счёт»: #3a3b40 with #1b1c1f in dark, #e7e7ec with #fff in light
    expect(background(container.querySelector('[role="group"]')!)).toBe('sheet-track');
    expect(background(segment('Сум'))).toBe('card');
    expect([...segment('USD').classList].some((name) => name.startsWith('bg-'))).toBe(false);
  });

  it('labels are 700; `strong` makes them 800, as the audit’s «Нужно / Лишнее» (FT-132)', () => {
    render(false);
    expect(segment('Сум').className).toContain('font-bold');
    act(() => root?.unmount());

    render(false, false, true);
    expect(segment('Сум').className).toContain('font-extrabold');
    expect(segment('USD').className).not.toContain('font-bold');
  });
});
