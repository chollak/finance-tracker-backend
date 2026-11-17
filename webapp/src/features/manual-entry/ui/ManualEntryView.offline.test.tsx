// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useConnectivityStore } from '@/shared/lib/offline';
import { READ_OFFLINE_TEXT } from '@/shared/ui/pastel';
import { initialManualEntry, manualEntryModel } from '../model/manualEntry';
import { ManualEntryView, type ManualEntryViewProps } from './ManualEntryView';

/**
 * #322: the manual entry's lists that could not be read use the same failed-read component as the screens, so without
 * a connection the «Нет связи» line stands above them — once, even when both lists failed. The texts with a
 * connection are as they were (`ManualEntryView.test.tsx`).
 */

const TODAY = '2026-10-14';
const noop = () => {};

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
  useConnectivityStore.setState({ browserOnline: true, lost: false });
});

function render(overrides: Partial<ManualEntryViewProps>): string {
  const state = initialManualEntry(TODAY, 'card');
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[ROUTES.MANUAL_ENTRY]}>
        <ManualEntryView
          type={state.type}
          note={state.note}
          model={manualEntryModel(state, { accounts: [], categories: [], rateMinor: null, today: TODAY })}
          accounts="ready"
          categories="ready"
          onType={noop}
          onAccount={noop}
          onCategory={noop}
          onKey={noop}
          onNote={noop}
          onOpenDate={noop}
          onSave={noop}
          onRetry={noop}
          {...overrides}
        />
      </MemoryRouter>
    );
  });
  return container.textContent ?? '';
}

const lines = (text: string) => text.split(READ_OFFLINE_TEXT).length - 1;

describe('the lists of the manual entry that could not be read', () => {
  it('without a connection carry the «Нет связи» line once, whichever failed', () => {
    useConnectivityStore.setState({ browserOnline: false, lost: false });

    const both = render({ accounts: 'failed', categories: 'failed' });
    expect(lines(both)).toBe(1);
    expect(both).toContain('Не получилось загрузить счета');
    expect(both).toContain('Не получилось загрузить категории');

    expect(lines(render({ accounts: 'failed' }))).toBe(1);
    expect(lines(render({ categories: 'failed' }))).toBe(1);
  });

  it('with a connection say only what is missing', () => {
    const both = render({ accounts: 'failed', categories: 'failed' });

    expect(lines(both)).toBe(0);
    expect(both).toContain('Не получилось загрузить счета');
    expect(both.split('Попробовать снова')).toHaveLength(3);
  });
});
