// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { CaptureOfflinePage } from './CaptureOfflinePage';

/**
 * FT-129, boards «Голос без связи» and «Чек без связи» (ProblemScreen.md): voice and receipts are read on the server,
 * so without a connection their screens say so honestly and offer the one exit that surely works — «Ввести вручную»,
 * whose record is kept on the device. «Отмена» goes back.
 */

let root: Root | null = null;
let container: HTMLDivElement;
let shownPath = '';
let shownState: unknown = null;

function Where() {
  const location = useLocation();
  useEffect(() => {
    shownPath = location.pathname;
    shownState = location.state;
  });
  return null;
}

async function open(kind: 'voice' | 'receipt'): Promise<void> {
  const path = kind === 'voice' ? ROUTES.VOICE_OFFLINE : ROUTES.RECEIPT_OFFLINE;
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[ROUTES.HOME, path]} initialIndex={1}>
        <Routes>
          <Route path={path} element={<CaptureOfflinePage kind={kind} />} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </MemoryRouter>
    );
  });
}

async function press(name: string): Promise<void> {
  const target = [...container.querySelectorAll('button')].find((button) => button.textContent === name);
  if (!target) throw new Error(`No button «${name}»`);
  await act(async () => {
    target.click();
  });
}

const text = () => container.textContent?.replace(/\s+/g, ' ') ?? '';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('voice without a connection', () => {
  it('says voice works only with a connection and that a manual record is kept on this device', async () => {
    await open('voice');

    expect(container.querySelector('h1')?.textContent).toBe('Голос работает только со связью');
    expect(text()).toContain(
      'Речь распознаётся на сервере. Запишите вручную — запись сохранится на этом устройстве и отправится, когда связь вернётся.'
    );
  });

  it('«Ввести вручную» opens the manual entry in its place, which returns to Home after the save', async () => {
    await open('voice');

    await press('Ввести вручную');

    expect(shownPath).toBe(ROUTES.MANUAL_ENTRY);
    expect(shownState).toEqual({ from: ROUTES.HOME });
  });

  it('«Отмена» goes back', async () => {
    await open('voice');

    await press('Отмена');

    expect(shownPath).toBe(ROUTES.HOME);
  });
});

describe('a receipt without a connection', () => {
  it('says receipts are read only with a connection and the record can be completed with it later', async () => {
    await open('receipt');

    expect(container.querySelector('h1')?.textContent).toBe('Чек читается только со связью');
    expect(text()).toContain(
      'Чеки распознаются на сервере. Запишите сумму вручную — запись сохранится на этом устройстве. Когда связь вернётся, чек можно снять и дополнить им запись.'
    );
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Отмена', 'Ввести вручную']);
  });
});
