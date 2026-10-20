// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function render(usdUnavailable: boolean): void {
  root = createRoot(container);
  act(() => {
    root!.render(
      <Segmented
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
});
