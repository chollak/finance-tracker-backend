// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OptionPicker } from './picker';

/**
 * Picker.md, boards «Компонент · шторка выбора» and «Тема» (FT-125 review): the options sit in a `sheet-card`, the
 * lines between them start 16px in, under the text, and each row is pressable edge to edge. «Тема» keeps 4px above
 * the first option and under the last, as the lists of «Ещё» do. jsdom draws no layout: the classes say it.
 */

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(padded?: boolean) {
  act(() => {
    root.render(
      <OptionPicker
        open
        onOpenChange={() => {}}
        title="Тема"
        options={[
          { id: 'telegram', name: 'Как в Telegram', detail: 'Сейчас в Telegram светлая' },
          { id: 'light', name: 'Светлая', detail: 'Всегда светлая' },
          { id: 'dark', name: 'Тёмная', detail: 'Всегда тёмная' },
        ]}
        selectedId="telegram"
        onSelect={() => {}}
        padded={padded}
      />
    );
  });
}

const card = () => document.body.querySelector<HTMLElement>('[role="radiogroup"]')!;
const rows = () => [...card().querySelectorAll<HTMLElement>('[role="radio"]')];
const classes = (element: Element) => element.className.split(/\s+/);

describe('OptionPicker', () => {
  it('draws the line between rows 16px in, and each row is pressable edge to edge', () => {
    render();

    // No border across the whole card: the line is the row's own, inset like its text
    expect(classes(card())).not.toContain('px-4');
    expect(card().className).not.toMatch(/border-t/);
    const [first, ...rest] = rows();
    expect(classes(first)).toContain('px-4');
    expect(first.className).not.toMatch(/before:/);
    for (const row of rest) {
      expect(classes(row)).toEqual(expect.arrayContaining(['px-4', 'before:inset-x-4', 'before:h-px', 'before:bg-line']));
    }
  });

  it('a padded card keeps 4px above the first option and under the last («Тема»); the account choice does not', () => {
    render(true);
    expect(classes(card())).toContain('py-1');

    render(false);
    expect(classes(card())).not.toContain('py-1');
  });
});
