import { describe, it, expect, vi, afterEach } from 'vitest';
import { openTelegramSession, applyTelegramTheme } from './telegram';

function stubTelegram(webApp: unknown) {
  const ready = vi.fn();
  const expand = vi.fn();
  vi.stubGlobal('window', {
    Telegram: webApp === null ? undefined : { WebApp: { ready, expand, ...(webApp as object) } },
  });
  return { ready, expand };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('openTelegramSession', () => {
  it('возвращает telegramId и имя из initDataUnsafe', () => {
    stubTelegram({
      initDataUnsafe: { user: { id: 131184740, first_name: 'Шукур', last_name: 'Сапаев' } },
    });

    expect(openTelegramSession()).toEqual({
      telegramId: '131184740',
      userName: 'Шукур Сапаев',
    });
  });

  it('зовёт ready и expand — иначе окно открывается половинкой экрана', () => {
    const { ready, expand } = stubTelegram({
      initDataUnsafe: { user: { id: 1, first_name: 'A' } },
    });

    openTelegramSession();

    expect(ready).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledTimes(1);
  });

  it('отдаёт telegramId строкой, а не числом', () => {
    // В путь запроса всегда идёт telegramId: при UUID проверка владения
    // на сервере пропускается целиком.
    stubTelegram({ initDataUnsafe: { user: { id: 131184740, first_name: 'A' } } });

    const session = openTelegramSession();

    expect(typeof session?.telegramId).toBe('string');
  });

  it('не падает, если имени нет', () => {
    stubTelegram({ initDataUnsafe: { user: { id: 7, first_name: '' } } });

    expect(openTelegramSession()?.userName).toBe('Пользователь');
  });

  it('вне Telegram возвращает null, а не выдуманного гостя', () => {
    stubTelegram(null);

    expect(openTelegramSession()).toBeNull();
  });

  it('без пользователя в initDataUnsafe возвращает null', () => {
    stubTelegram({ initDataUnsafe: {} });

    expect(openTelegramSession()).toBeNull();
  });
});

describe('applyTelegramTheme', () => {
  it('ставит тему из Telegram, а не из системы', () => {
    const root = { dataset: {} as Record<string, string> };
    vi.stubGlobal('window', { Telegram: { WebApp: { colorScheme: 'dark' } } });
    vi.stubGlobal('document', { documentElement: root });

    applyTelegramTheme();

    expect(root.dataset.theme).toBe('dark');
  });

  it('молчит, когда Telegram темы не сообщил', () => {
    const root = { dataset: {} as Record<string, string> };
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { documentElement: root });

    applyTelegramTheme();

    expect(root.dataset.theme).toBeUndefined();
  });
});
