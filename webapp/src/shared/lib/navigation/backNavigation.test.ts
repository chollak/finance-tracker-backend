import { describe, expect, it, vi } from 'vitest';
import {
  backControl,
  backStep,
  closeStep,
  homeAfterSaveStep,
  keepTelegramBackButtonInStep,
  parentPath,
  syncTelegramBackButton,
  telegramBackButton,
  type BackStep,
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
    expect(parentPath('/add')).toBe('/');
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
    expect(backControl('/add', true)).toBe('telegram');
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

/**
 * The browser history as react-router's BrowserRouter keeps it: entries, the current one and its index
 * (`history.state.idx`). `open` is a tap on a link (a push); «Назад» and closing a form run the step the
 * app picks, as `useGoBack` / `useCloseScreen` do: `history` is `navigate(-1)`, `route` is
 * `navigate(to, { replace: true })`.
 */
function appHistory(start: string) {
  const entries = [start];
  let index = 0;
  const run = (step: BackStep | null) => {
    if (!step) return;
    if (step.kind === 'history') index -= 1;
    else entries[index] = step.to;
  };
  return {
    get path() {
      return entries[index];
    },
    /** What «Назад» can still reach: the current entry and those below it. */
    get stack() {
      return entries.slice(0, index + 1);
    },
    open(to: string) {
      entries.splice(index + 1);
      entries.push(to);
      index += 1;
    },
    back() {
      run(backStep(entries[index], index));
    },
    close() {
      run(closeStep(entries[index], index));
    },
    /** A saved record shows Home (FT-113); `openedFrom` is what the link to the screen passed along. */
    saveToHome(openedFrom?: string) {
      run(homeAfterSaveStep(index, openedFrom));
    },
  };
}

describe('closeStep — a form closes after a save or a delete the way «Назад» does', () => {
  it('list → form → save: «Назад» lands on the screen that opened the list, never on the form', () => {
    const history = appHistory('/');
    history.open('/transactions');
    history.open('/transactions/t1/edit');

    history.close();
    expect(history.path).toBe('/transactions');
    expect(history.stack).toEqual(['/', '/transactions']);

    history.back();
    expect(history.path).toBe('/');
  });

  it('a record opened from Home returns to Home after the save', () => {
    const history = appHistory('/');
    history.open('/transactions/t1/edit');

    history.close();
    expect(history.path).toBe('/');
    expect(history.stack).toEqual(['/']);
  });

  it('manual entry returns to the screen it was opened from', () => {
    const history = appHistory('/');
    history.open('/more');
    history.open('/add');

    history.close();
    expect(history.path).toBe('/more');
  });

  it('a deleted debt is never shown again: «Назад» walks the list, «Ещё», Home', () => {
    const history = appHistory('/');
    history.open('/more');
    history.open('/debts');
    history.open('/debts/d1');

    history.close();
    const visited = [history.path];
    history.back();
    visited.push(history.path);
    history.back();
    visited.push(history.path);

    expect(visited).toEqual(['/debts', '/more', '/']);
    expect(backStep(history.path, 0)).toBeNull();
  });

  it('a saved or deleted budget and a created budget or debt leave no form under their list', () => {
    for (const form of ['/budgets/b1/edit', '/budgets/add']) {
      const history = appHistory('/');
      history.open('/more');
      history.open('/budgets');
      history.open(form);

      history.close();
      expect(history.stack).toEqual(['/', '/more', '/budgets']);
    }

    const history = appHistory('/');
    history.open('/more');
    history.open('/debts');
    history.open('/debts/add');
    history.close();
    expect(history.stack).toEqual(['/', '/more', '/debts']);
  });

  it('a form opened by a link from the bot gives its place to its parent, so the app never shows it again', () => {
    const history = appHistory('/transactions/t1/edit');

    history.close();
    expect(history.stack).toEqual(['/transactions']);

    history.back();
    expect(history.stack).toEqual(['/']);
  });

  it('on Home there is nothing to close: it stays on Home', () => {
    expect(closeStep('/', 0)).toEqual({ kind: 'route', to: '/' });
  });
});

describe('keepTelegramBackButtonInStep — the app shell’s effect for a screen', () => {
  it('inside Telegram it shows the BackButton on a nested screen and a press goes back', () => {
    const app = webApp();
    const goBack = vi.fn();

    const cleanup = keepTelegramBackButtonInStep(app, '/transactions', goBack);
    expect(app.BackButton.visible).toBe(true);
    app.BackButton.press();
    expect(goBack).toHaveBeenCalledTimes(1);

    cleanup();
    expect(app.BackButton.handlerCount()).toBe(0);
  });

  it('inside Telegram it hides the BackButton on Home', () => {
    const app = webApp();
    app.BackButton.visible = true;

    keepTelegramBackButtonInStep(app, '/', vi.fn());
    expect(app.BackButton.visible).toBe(false);
  });

  it('outside Telegram it leaves the BackButton alone: the screen draws its own «Назад»', () => {
    const app = webApp({ initData: '' });

    keepTelegramBackButtonInStep(app, '/transactions', vi.fn())();
    keepTelegramBackButtonInStep(undefined, '/transactions', vi.fn())();
    expect(app.BackButton.show).not.toHaveBeenCalled();
    expect(app.BackButton.onClick).not.toHaveBeenCalled();
  });
});

describe('homeAfterSaveStep — a saved record shows Home (FT-113)', () => {
  it('opened from Home: one step back, so Home is not stacked twice', () => {
    const history = appHistory('/');
    history.open('/add');

    history.saveToHome('/');
    expect(history.path).toBe('/');
    expect(history.stack).toEqual(['/']);
  });

  it('opened from another screen: Home takes the entry screen’s place, never the form again', () => {
    const history = appHistory('/');
    history.open('/more');
    history.open('/add');

    history.saveToHome('/more');
    expect(history.path).toBe('/');
    expect(history.stack).toEqual(['/', '/more', '/']);
  });

  it('opened directly (a link, a reload): Home in its place', () => {
    const history = appHistory('/add');

    history.saveToHome(undefined);
    expect(history.path).toBe('/');
    expect(history.stack).toEqual(['/']);
  });
});
