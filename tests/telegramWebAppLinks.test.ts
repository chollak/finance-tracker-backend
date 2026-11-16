import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import { recordKeyboard } from '../src/delivery/messaging/telegram/keyboards';
import { formatDaySummary, formatMonthSummary } from '../src/delivery/messaging/telegram/formatters/summaryMessage';
import { formatReminder } from '../src/delivery/messaging/telegram/formatters/reminderMessage';
import { appLinks, canLinkMiniApp, createWebAppUrl, isHttpsUrl } from '../src/delivery/messaging/telegram/utils/webAppUrl';
import { DaySummary, MonthSummary } from '../src/modules/notification/domain/dailySummary';
import { RecordMessageInput, RecordView } from '../src/delivery/messaging/telegram/formatters/recordMessage';
import { recordMessageInput } from '../src/delivery/messaging/telegram/utils/recordMessageView';
// The webapp's own route constants: its tests match them against its route table (appRoutes)
import { ROUTES } from '../webapp/src/shared/lib/constants/routes';

/**
 * The bot's Mini App buttons open real screens of the webapp. FT-113 moved manual entry from
 * /transactions/add to /add; a bot link left on the old address opened «Страница не найдена». FT-115
 * replaced the edit page /transactions/:id/edit with the record sheet, which Home opens from `?record=`.
 * FT-122: the links under a record message — «Открыть в Kapelka ↗», «Другая дата ↗», «Остальные — в
 * Kapelka ↗» — are built by the bot from the same helper. FT-124: «Открыть Kapelka ↗» under /start and the daily
 * summary, «Открыть аналитику ↗» under /month.
 */

const BASE_URL = 'https://miniapp.test';
const USER_ID = '597843119';
const RECORD_ID = 'tx-1';

interface Button {
  text: string;
  web_app?: { url: string };
}

type Keyboard = { reply_markup: { inline_keyboard: Button[][] } } | undefined;

function record(id: string): RecordView {
  return {
    id, type: 'expense', semanticType: 'expense', amountMinor: 2_400_000, currency: 'UZS', categoryName: 'Транспорт',
    note: 'такси', accountName: 'Карта', date: '2026-10-14', needsReview: false, cancelled: false,
  };
}

/** The keyboard under a record message, with the Mini App links the bot builds for this user. */
async function recordMessageKeyboard(mode: RecordMessageInput['mode'], records = [record(RECORD_ID)]): Promise<Keyboard> {
  const ctx = {
    from: { id: Number(USER_ID) },
    modules: { transactionModule: { getGetTransactionByIdUseCase: () => ({ execute: async () => ({ success: false }) }) } },
  };
  const links = await recordMessageInput(ctx as any, { userId: 'user-1', recordIds: [], mode, state: { selected: 0, guessed: [] }, heard: null });
  const input: RecordMessageInput = { ...links, records, mode, accounts: [], categories: [] };
  return { reply_markup: { inline_keyboard: recordKeyboard(input) as Button[][] } };
}

const MANY = Array.from({ length: 7 }, (_, i) => record(`tx-${i}`));

const MONTH: MonthSummary = { month: '2026-10', today: '2026-10-14', totalMinor: 100_000, hasUsd: false, comparison: null, categories: [], usdLeftOut: false };
const DAY: DaySummary = {
  day: '2026-10-14', recordCount: 1, expenseMinor: 100_000, expenseHasUsd: false, expenseCount: 1, usdLeftOutCount: 0, categories: [], needsReviewCount: 0, month: MONTH,
};

/** The keyboard of a notice: the daily summary, /today, /month. */
function noticeKeyboard(notice: { keyboard: unknown }): Keyboard {
  return { reply_markup: { inline_keyboard: notice.keyboard as Button[][] } };
}

/** «Открыть Kapelka ↗» under the daily summary and /today (/start: tests/telegramCommands.test.ts). */
function summaryKeyboard(): Keyboard {
  return noticeKeyboard(formatDaySummary(DAY, { today: DAY.day, appUrl: appLinks.home() }));
}

/** The Mini App buttons of a keyboard. */
function webAppButtons(keyboard: Keyboard): Button[] {
  return (keyboard?.reply_markup.inline_keyboard ?? []).flat().filter((button) => button.web_app);
}

/** Where the button labelled `label` opens the Mini App. */
function urlOf(keyboard: Keyboard, label: string): URL {
  const button = webAppButtons(keyboard).find((candidate) => candidate.text.includes(label));
  if (!button?.web_app) throw new Error(`No Mini App button «${label}»`);
  return new URL(button.web_app.url);
}

beforeEach(() => {
  jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue(BASE_URL);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('«Открыть Kapelka ↗» and «Открыть аналитику ↗» (FT-124)', () => {
  it('the daily summary and /today open Home', () => {
    const url = urlOf(summaryKeyboard(), 'Открыть Kapelka');

    expect(url.toString()).toBe(`${BASE_URL}${ROUTES.HOME}`);
  });

  it('/month opens the analytics of the month', () => {
    const url = urlOf(noticeKeyboard(formatMonthSummary(MONTH, { analyticsUrl: appLinks.analytics() })), 'Открыть аналитику');

    expect(url.toString()).toBe(`${BASE_URL}${ROUTES.ANALYTICS}`);
  });
});

/** «Открыть ревизию ↗» under the audit call and «Открыть цели ↗» under a goal (FT-133). */
function auditCallKeyboard(): Keyboard {
  return noticeKeyboard(formatReminder({ kind: 'audit', month: '2026-10', left: 5, repeat: false }, { appUrl: appLinks.audit() }));
}

function goalKeyboard(): Keyboard {
  return noticeKeyboard(formatReminder(
    { kind: 'goal_near', today: '2026-10-27', goal: { id: 'goal-1', name: 'Такси', spentMinor: 8_400_000, limitMinor: 10_200_000, endsOn: '2026-10-31' } },
    { appUrl: appLinks.audit() }
  ));
}

describe('«Открыть ревизию ↗» and «Открыть цели ↗» (FT-133)', () => {
  it('open the audit: its screen shows the goals after «Готово»', () => {
    for (const [keyboard, label] of [[auditCallKeyboard(), 'Открыть ревизию'], [goalKeyboard(), 'Открыть цели']] as const) {
      expect(urlOf(keyboard, label).toString()).toBe(`${BASE_URL}${ROUTES.AUDIT}`);
    }
  });
});

describe('«Открыть в Kapelka ↗» under a record opens its sheet', () => {
  it.each([
    ['«Изменить»', 'edit' as const, 'Открыть в Kapelka'],
    ['the date picker', 'date' as const, 'Другая дата'],
  ])('from %s: Home with the record named, as the webapp links to a record', async (_name, mode, label) => {
    const url = urlOf(await recordMessageKeyboard(mode), label);

    expect(url.toString()).toBe(`${BASE_URL}${ROUTES.RECORD(RECORD_ID)}`);
  });

  it('«Остальные — в Kapelka ↗» under a message with many records opens History', async () => {
    const url = urlOf(await recordMessageKeyboard('confirm', MANY), 'Остальные — в Kapelka');

    expect(url.toString()).toBe(`${BASE_URL}${ROUTES.TRANSACTIONS}`);
  });
});

/** Every keyboard of the bot with a link to the Mini App. */
const keyboards: Array<[string, () => Keyboard | Promise<Keyboard>]> = [
  ['the daily summary and /today', () => summaryKeyboard()],
  ['/month', () => noticeKeyboard(formatMonthSummary(MONTH, { analyticsUrl: appLinks.analytics() }))],
  ['«Изменить» under a record', () => recordMessageKeyboard('edit')],
  ['the date picker under a record', () => recordMessageKeyboard('date')],
  ['a message with many records', () => recordMessageKeyboard('confirm', MANY)],
  ['the audit call', () => auditCallKeyboard()],
  ['a goal reminder', () => goalKeyboard()],
];

describe('every Mini App link of the bot is a screen of the webapp', () => {
  const screens = new Set<string>(Object.values(ROUTES).flatMap((route) => (typeof route === 'string' ? [route] : [])));

  it.each(keyboards)('%s', async (_name, build) => {
    const buttons = webAppButtons(await build());

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(screens).toContain(new URL(button.web_app!.url).pathname);
    }
  });

  // #281: `?userId=<Telegram id>` was left from the old sign-in; the webapp takes the user from initData and never read it
  it('none of them carries the Telegram id: the Mini App knows the user from initData', async () => {
    const built = await Promise.all(keyboards.map(([, build]) => build()));
    const urls = built.flatMap((keyboard) => webAppButtons(keyboard).map((button) => button.web_app!.url));

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).searchParams.has('userId')).toBe(false);
      expect(url).not.toContain(USER_ID);
    }
  });

  it('none of them opens the removed /transactions/add or /transactions/:id/edit', async () => {
    const built = await Promise.all(keyboards.map(([, build]) => build()));
    const paths = built.flatMap((keyboard) => webAppButtons(keyboard).map((button) => new URL(button.web_app!.url).pathname));

    expect(paths).not.toContain('/transactions/add');
    expect(paths.filter((path) => path.endsWith('/edit'))).toEqual([]);
  });
});

/**
 * #278: Telegram opens a Mini App only at an HTTPS address and refuses the whole message for a button to any other —
 * `npm run dev` without a tunnel runs with WEB_APP_URL=http://localhost:3000. The bot then links nowhere, as the login
 * leaves out «Вернуться в браузер ↗».
 */
describe('no link to the Mini App without an HTTPS address (#278)', () => {
  it.each(['http://localhost:3000', 'http://192.168.1.5:3000', 'localhost:3000', 'не адрес', ''])(
    'WEB_APP_URL=%p: no keyboard of the bot has a Mini App button',
    async (address) => {
      jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue(address);

      for (const [, build] of keyboards) expect(webAppButtons(await build())).toEqual([]);
      expect([appLinks.home(), appLinks.analytics(), appLinks.audit()]).toEqual([undefined, undefined, undefined]);
      expect(canLinkMiniApp()).toBe(false);
    }
  );

  it('createWebAppUrl refuses such an address on its own, for a caller that does not ask canLinkMiniApp first', () => {
    expect(canLinkMiniApp()).toBe(true);
    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('http://localhost:3000');

    expect(() => createWebAppUrl()).toThrow('WEB_APP_URL is not an HTTPS address');
    expect(() => createWebAppUrl({ edit: RECORD_ID })).toThrow('WEB_APP_URL is not an HTTPS address');
    expect(() => createWebAppUrl({ path: 'transactions' })).toThrow('WEB_APP_URL is not an HTTPS address');

    jest.spyOn(AppConfig, 'getWebAppUrl').mockReturnValue('');
    expect(() => createWebAppUrl()).toThrow('WEB_APP_URL not configured');
  });

  it('the one rule: an HTTPS address, whatever the case of its scheme', () => {
    expect(isHttpsUrl('https://miniapp.test')).toBe(true);
    expect(isHttpsUrl('HTTPS://miniapp.test/path')).toBe(true);
    for (const address of ['http://localhost:3000', 'ftp://miniapp.test', 'https//miniapp.test', 'miniapp.test', '', undefined]) {
      expect(isHttpsUrl(address)).toBe(false);
    }
  });
});
