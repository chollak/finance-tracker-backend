import { describe, expect, it, vi } from 'vitest';
import {
  backControl,
  backStep,
  parentPath,
  syncTelegramBackButton,
  telegramBackButton,
  type TelegramBackButtonApi,
} from './backNavigation';

function fakeButton() {
  const handlers = new Set<() => void>();
  const button: TelegramBackButtonApi & { visible: boolean; press: () => void; handlerCount: () => number } = {
    visible: false,
    show: vi.fn(() => {
      button.visible = true;
    }),
    hide: vi.fn(() => {
      button.visible = false;
    }),
    onClick: vi.fn((callback: () => void) => {
      handlers.add(callback);
    }),
    offClick: vi.fn((callback: () => void) => {
      handlers.delete(callback);
    }),
    press: () => handlers.forEach((handler) => handler()),
    handlerCount: () => handlers.size,
  };
  return button;
}

function webApp(overrides: { initData?: string; version?: string; supports?: boolean } = {}) {
  const BackButton = fakeButton();
  return {
    initData: overrides.initData ?? 'query_id=1&user=%7B%7D&hash=abc',
    version: overrides.version ?? '8.0',
    isVersionAtLeast: (version: string) => overrides.supports ?? Number(overrides.version ?? '8.0') >= Number(version),
    BackButton,
  };
}

describe('parentPath — where «Назад» leads when there is no app screen to return to', () => {
  it('Home is the top: it has no back', () => {
    expect(parentPath('/')).toBeNull();
    expect(parentPath('')).toBeNull();
  });

  it('History, Analytics and «Ещё» are opened from Home and return to it', () => {
    expect(parentPath('/transactions')).toBe('/');
    expect(parentPath('/analytics')).toBe('/');
    expect(parentPath('/more')).toBe('/');
    expect(parentPath('/transactions/')).toBe('/');
  });

  it('sections opened from «Ещё» return to «Ещё»', () => {
    expect(parentPath('/budgets')).toBe('/more');
    expect(parentPath('/debts')).toBe('/more');
  });

  it('a form or a detail screen returns to its section', () => {
    expect(parentPath('/transactions/7f3a/edit')).toBe('/transactions');
    expect(parentPath('/budgets/add')).toBe('/budgets');
    expect(parentPath('/budgets/b1/edit')).toBe('/budgets');
    expect(parentPath('/debts/add')).toBe('/debts');
    expect(parentPath('/debts/d1')).toBe('/debts');
  });

  it('manual entry is a way to write, not part of History: it returns to Home', () => {
    expect(parentPath('/transactions/add')).toBe('/');
  });

  it('an unknown address returns to Home', () => {
    expect(parentPath('/no-such-screen')).toBe('/');
  });
});

describe('backStep', () => {
  it('goes one step back when an app screen opened this one', () => {
    expect(backStep('/transactions', 1)).toEqual({ kind: 'history' });
    expect(backStep('/budgets/add', 3)).toEqual({ kind: 'history' });
  });

  it('opened directly (a link from the bot, a reload) it goes to the parent screen instead of leaving the app', () => {
    expect(backStep('/transactions/7f3a/edit', 0)).toEqual({ kind: 'route', to: '/transactions' });
    expect(backStep('/budgets', undefined)).toEqual({ kind: 'route', to: '/more' });
  });

  it('Home has no back', () => {
    expect(backStep('/', 2)).toBeNull();
  });
});

describe('telegramBackButton — Telegram’s own BackButton only inside Telegram', () => {
  it('none without Telegram', () => {
    expect(telegramBackButton(undefined)).toBeNull();
  });

  it('none in a plain browser: the SDK is loaded there too, but initData is empty', () => {
    expect(telegramBackButton(webApp({ initData: '' }))).toBeNull();
  });

  it('none in a Telegram client older than Bot API 6.1, which has no BackButton', () => {
    expect(telegramBackButton(webApp({ version: '6.0' }))).toBeNull();
  });

  it('the BackButton inside Telegram', () => {
    const app = webApp();
    expect(telegramBackButton(app)).toBe(app.BackButton);
  });
});

describe('backControl — which «Назад» a screen gets', () => {
  it('nested screens inside Telegram use Telegram’s BackButton', () => {
    expect(backControl('/transactions', true)).toBe('telegram');
    expect(backControl('/transactions/add', true)).toBe('telegram');
  });

  it('nested screens outside Telegram draw their own «Назад»', () => {
    expect(backControl('/analytics', false)).toBe('own');
    expect(backControl('/debts/d1', false)).toBe('own');
  });

  it('Home has neither', () => {
    expect(backControl('/', true)).toBe('none');
    expect(backControl('/', false)).toBe('none');
  });
});

describe('syncTelegramBackButton', () => {
  it('shows the BackButton on a nested screen and a press goes back', () => {
    const button = fakeButton();
    const goBack = vi.fn();

    syncTelegramBackButton(button, '/transactions', goBack);
    expect(button.visible).toBe(true);

    button.press();
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('hides it on Home', () => {
    const button = fakeButton();
    button.visible = true;

    syncTelegramBackButton(button, '/', vi.fn());
    expect(button.visible).toBe(false);
    expect(button.handlerCount()).toBe(0);
  });

  it('moving between screens leaves one handler, so one press is one step back', () => {
    const button = fakeButton();
    const first = vi.fn();
    const second = vi.fn();

    const cleanup = syncTelegramBackButton(button, '/more', first);
    cleanup();
    syncTelegramBackButton(button, '/budgets', second);

    button.press();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(button.handlerCount()).toBe(1);
  });

  it('does not hide and show again between two nested screens', () => {
    const button = fakeButton();
    const cleanup = syncTelegramBackButton(button, '/more', vi.fn());
    cleanup();
    syncTelegramBackButton(button, '/budgets', vi.fn());

    expect(button.hide).not.toHaveBeenCalled();
    expect(button.visible).toBe(true);
  });
});
