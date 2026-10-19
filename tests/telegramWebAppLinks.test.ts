import { AppConfig } from '../src/shared/infrastructure/config/appConfig';
import {
  budgetKeyboard,
  mainMenuKeyboard,
  statsKeyboard,
  todayKeyboard,
  transactionAutoSavedKeyboard,
  transactionConfirmationKeyboard,
  transactionEditKeyboard,
} from '../src/delivery/messaging/telegram/keyboards';
import { RU } from '../src/delivery/messaging/telegram/i18n/ru';
// The webapp's own route constants: its tests match them against its route table (appRoutes)
import { ROUTES } from '../webapp/src/shared/lib/constants/routes';

/**
 * The bot's Mini App buttons open real screens of the webapp. FT-113 moved manual entry from
 * /transactions/add to /add; a bot link left on the old address opened «Страница не найдена».
 */

const BASE_URL = 'https://miniapp.test';
const USER_ID = '597843119';
const RECORD_ID = 'tx-1';

interface Button {
  text: string;
  web_app?: { url: string };
}

type Keyboard = { reply_markup: { inline_keyboard: Button[][] } } | undefined;

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

describe('«Добавить» in the bot opens manual entry', () => {
  it('from the /start menu', () => {
    const url = urlOf(mainMenuKeyboard(USER_ID), RU.buttons.addTransaction);

    expect(url.origin).toBe(BASE_URL);
    expect(url.pathname).toBe(ROUTES.MANUAL_ENTRY);
    expect(url.pathname).toBe('/add');
    expect(url.searchParams.get('userId')).toBe(USER_ID);
  });

  it('under an auto-saved record', () => {
    const url = urlOf(transactionAutoSavedKeyboard(RECORD_ID, USER_ID), RU.buttons.addTransaction);

    expect(url.pathname).toBe(ROUTES.MANUAL_ENTRY);
    expect(url.pathname).toBe('/add');
    expect(url.searchParams.get('userId')).toBe(USER_ID);
  });
});

describe('every Mini App link of the bot is a screen of the webapp', () => {
  const screens = new Set<string>([
    ...Object.values(ROUTES).flatMap((route) => (typeof route === 'string' ? [route] : [])),
    ROUTES.EDIT_TRANSACTION(RECORD_ID),
  ]);

  const keyboards: Array<[string, () => Keyboard]> = [
    ['/start menu', () => mainMenuKeyboard(USER_ID)],
    ['/stats', () => statsKeyboard(USER_ID)],
    ['/budget with budgets', () => budgetKeyboard(USER_ID, true)],
    ['/budget without budgets', () => budgetKeyboard(USER_ID, false)],
    ['/today', () => todayKeyboard(USER_ID)],
    ['an auto-saved record', () => transactionAutoSavedKeyboard(RECORD_ID, USER_ID)],
    ['a record to confirm', () => transactionConfirmationKeyboard(RECORD_ID, USER_ID)],
    ['editing a record', () => transactionEditKeyboard(RECORD_ID, USER_ID)],
  ];

  it.each(keyboards)('%s', (_name, build) => {
    const buttons = webAppButtons(build());

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(screens).toContain(new URL(button.web_app!.url).pathname);
    }
  });

  it('none of them opens the removed /transactions/add', () => {
    const paths = keyboards.flatMap(([, build]) => webAppButtons(build()).map((button) => new URL(button.web_app!.url).pathname));

    expect(paths).not.toContain('/transactions/add');
  });
});
