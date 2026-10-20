import {
  formatRecordMessage,
  RecordMessageInput,
  RecordView,
} from '../src/delivery/messaging/telegram/formatters/recordMessage';
import { recordKeyboard } from '../src/delivery/messaging/telegram/keyboards/recordKeyboard';

/**
 * The bot's record message (FT-122): BotRecord text and BotKeyboard buttons, as on the boards «Бот ·
 * запись текстом и голосом», «Бот · исправление записи», «Бот · выбор категории», «Бот · «не 25, а 28»
 * и /undo» and «Бот · доход, доллары, отмена».
 */

const NB = ' ';
const MINUS = '−';
const TODAY = '2026-10-14';

function record(overrides: Partial<RecordView> = {}): RecordView {
  return {
    id: 'tx-1',
    type: 'expense',
    semanticType: 'expense',
    amountMinor: 2_400_000,
    currency: 'UZS',
    categoryId: 'cat-transport',
    categoryName: 'Транспорт',
    note: 'такси',
    accountId: 'acc-cash',
    accountName: 'Наличные',
    date: TODAY,
    needsReview: false,
    cancelled: false,
    ...overrides,
  };
}

const EXPENSE_CATEGORIES = [
  ['cat-groceries', 'Продукты'], ['cat-cafe', 'Кафе'], ['cat-transport', 'Транспорт'], ['cat-home', 'Дом'],
  ['cat-phone', 'Связь'], ['cat-health', 'Здоровье'], ['cat-shopping', 'Покупки'], ['cat-other', 'Другое'],
].map(([id, name]) => ({ id, name, type: 'expense' as const }));
const INCOME_CATEGORIES = [
  ['inc-salary', 'Зарплата'], ['inc-freelance', 'Фриланс'], ['inc-business', 'Бизнес'], ['inc-interest', 'Проценты'],
  ['inc-cashback', 'Кэшбэк'], ['inc-gifts', 'Подарки'], ['inc-refund', 'Возврат'], ['inc-other', 'Другое'],
].map(([id, name]) => ({ id, name, type: 'income' as const }));
const ACCOUNTS = [
  { id: 'acc-cash', name: 'Наличные', currency: 'UZS' as const },
  { id: 'acc-card', name: 'Карта', currency: 'UZS' as const },
  { id: 'acc-usd', name: 'Доллары', currency: 'USD' as const },
];

function input(overrides: Partial<RecordMessageInput> = {}): RecordMessageInput {
  return {
    records: [record()],
    mode: 'confirm',
    state: { selected: 0, guessed: [] },
    heard: null,
    today: TODAY,
    categories: [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES],
    accounts: ACCOUNTS,
    recordUrl: id => `https://miniapp.test/?record=${id}&userId=131184740`,
    ...overrides,
  };
}

interface Button { text: string; callback_data?: string; web_app?: { url: string } }

function rows(value: RecordMessageInput): Button[][] {
  return recordKeyboard(value) as Button[][];
}

function labels(value: RecordMessageInput): string[][] {
  return rows(value).map(row => row.map(button => button.text));
}

function data(value: RecordMessageInput): string[][] {
  return rows(value).map(row => row.map(button => button.callback_data ?? `link:${button.web_app?.url}`));
}

// What Telegram draws as an emoji picture. The text arrow «↗» of app links and «✓» are not emoji.
const EMOJI = /\p{Emoji_Presentation}|\uFE0F/u;

describe('BotRecord text (FT-122)', () => {
  it('confirms one expense in three lines: bold amount, category and note, account and absolute date', () => {
    expect(formatRecordMessage(input())).toBe(
      `<b>Расход ${MINUS}24${NB}000${NB}сум</b>\nТранспорт · «Такси»\nНаличные · 14${NB}октября`
    );
  });

  it('quotes what it heard after a voice message', () => {
    const text = formatRecordMessage(input({
      records: [record({ amountMinor: 18_640_000, categoryName: 'Продукты', note: 'Супермаркет', accountName: 'Карта' })],
      heard: 'Супермаркет сто восемьдесят шесть тысяч четыреста, картой',
    }));

    expect(text).toBe(
      `<b>Расход ${MINUS}186${NB}400${NB}сум</b>\nПродукты · «Супермаркет»\nКарта · 14${NB}октября\n`
      + '<blockquote><i>Расслышал: «Супермаркет сто восемьдесят шесть тысяч четыреста, картой»</i></blockquote>'
    );
  });

  it('writes income with a plus and leaves out a note that only repeats the category', () => {
    const text = formatRecordMessage(input({
      records: [record({ type: 'income', semanticType: 'income', amountMinor: 320_000_000, categoryName: 'Фриланс', note: 'фриланс', accountName: 'Карта', date: '2026-10-15' })],
      today: '2026-10-15',
    }));

    expect(text).toBe(`<b>Доход +3${NB}200${NB}000${NB}сум</b>\nФриланс\nКарта · 15${NB}октября`);
  });

  it('writes dollars with cents and the unit', () => {
    const text = formatRecordMessage(input({
      records: [record({ amountMinor: 5_500, currency: 'USD', categoryName: 'Покупки', note: 'наушники', accountName: 'Доллары' })],
    }));

    expect(text.split('\n')[0]).toBe(`<b>Расход ${MINUS}55,00${NB}USD</b>`);
    expect(text).toContain('Покупки · «Наушники»\nДоллары · 14');
  });

  it('always writes the date itself, never «сегодня» or «вчера»; another year gets its year', () => {
    expect(formatRecordMessage(input({ records: [record({ date: '2026-10-13' })] }))).toContain(`Наличные · 13${NB}октября`);
    expect(formatRecordMessage(input({ records: [record({ date: '2025-12-31' })] }))).toContain(`Наличные · 31${NB}декабря 2025`);
    expect(formatRecordMessage(input())).not.toMatch(/сегодня|вчера/i);
  });

  it('marks a category the parse guessed with «?»', () => {
    const text = formatRecordMessage(input({
      records: [record({ id: 'tx-uzum', categoryName: 'Покупки', note: 'Uzum', accountName: 'Карта' })],
      state: { selected: 0, guessed: ['tx-uzum'] },
    }));

    expect(text).toContain('Покупки? · «Uzum»');
  });

  it('puts several records of one phrase into one message, a line each', () => {
    const text = formatRecordMessage(input({
      records: [
        record({ id: 'tx-1', amountMinor: 2_500_000, categoryName: 'Кафе', note: 'кофе', accountName: 'Карта', date: '2026-10-16' }),
        record({ id: 'tx-2', amountMinor: 1_800_000, categoryName: 'Транспорт', note: 'такси', accountName: 'Карта', date: '2026-10-16' }),
      ],
      today: '2026-10-16',
    }));

    expect(text).toBe(
      `<b>Расходы ${MINUS}43${NB}000${NB}сум · 2 записи</b>\n`
      + `${MINUS}25${NB}000 · Кафе · «Кофе»\n`
      + `${MINUS}18${NB}000 · Транспорт · «Такси»\n`
      + `Карта · 16${NB}октября`
    );
  });

  it('gives each of several records its own account and date when they differ', () => {
    const text = formatRecordMessage(input({
      records: [
        record({ id: 'tx-1', amountMinor: 2_500_000, categoryName: 'Кафе', note: 'кофе', accountName: 'Карта' }),
        record({ id: 'tx-2', amountMinor: 1_800_000, note: 'такси', accountName: 'Наличные' }),
      ],
    }));

    expect(text).toContain(`${MINUS}25${NB}000 · Кафе · «Кофе» · Карта · 14${NB}октября`);
    expect(text).toContain(`${MINUS}18${NB}000 · Транспорт · «Такси» · Наличные · 14${NB}октября`);
  });

  it('strikes a cancelled record through and says it is gone from the app', () => {
    const text = formatRecordMessage(input({
      records: [record({ amountMinor: 1_800_000, cancelled: true, date: '2026-10-18' })],
      heard: 'такси восемнадцать тысяч',
      today: '2026-10-18',
    }));

    expect(text).toBe(
      `<s><b>Расход ${MINUS}18${NB}000${NB}сум</b></s>\n<s>Транспорт · «Такси»</s>\n<s>Наличные · 18${NB}октября</s>\n\n`
      + 'Отменено — в приложении этой записи нет.'
    );
  });

  it('strikes one cancelled record of several and keeps the others', () => {
    const text = formatRecordMessage(input({
      records: [
        record({ id: 'tx-1', amountMinor: 2_500_000, categoryName: 'Кафе', note: 'кофе' }),
        record({ id: 'tx-2', amountMinor: 1_800_000, note: 'такси', cancelled: true }),
      ],
    }));

    expect(text.split('\n')[0]).toBe(`<b>Расходы ${MINUS}25${NB}000${NB}сум · 1 запись</b>`);
    expect(text).toContain(`<s>${MINUS}18${NB}000 · Транспорт · «Такси»</s>`);
    expect(text).not.toContain('Отменено');
  });

  it('says the last change in italics under the record', () => {
    const text = formatRecordMessage(input({ state: { selected: 0, guessed: [], changed: `Сумма изменена: было 25${NB}000` } }));

    expect(text.endsWith(`\n\n<i>Сумма изменена: было 25${NB}000.</i>`)).toBe(true);
  });

  it('asks what to change, which category, account, date or amount', () => {
    expect(formatRecordMessage(input({ mode: 'edit' }))).toMatch(/\n\n<i>Что изменить\?<\/i>$/);
    expect(formatRecordMessage(input({ mode: 'category' }))).toMatch(/\n\n<i>Выберите категорию:<\/i>$/);
    expect(formatRecordMessage(input({ mode: 'category', state: { selected: 0, guessed: [], pickType: 'income' } })))
      .toMatch(/\n\n<i>Выберите категорию дохода:<\/i>$/);
    expect(formatRecordMessage(input({ mode: 'account' }))).toMatch(/\n\n<i>Выберите счёт:<\/i>$/);
    expect(formatRecordMessage(input({ mode: 'date' }))).toMatch(/\n\n<i>Когда это было\?<\/i>$/);
    expect(formatRecordMessage(input({ mode: 'amount' }))).toMatch(/\n\n<b>Напишите новую сумму — например, 150к\.<\/b>$/);
    expect(formatRecordMessage(input({ mode: 'amount', records: [record({ currency: 'USD', amountMinor: 5_500, accountName: 'Доллары' })] })))
      .toMatch(/например, 60\$\.<\/b>$/);
  });

  it('names the record being changed when the message has several, and marks its line', () => {
    const text = formatRecordMessage(input({
      mode: 'edit',
      state: { selected: 1, guessed: [] },
      records: [
        record({ id: 'tx-1', amountMinor: 2_500_000, categoryName: 'Кафе', note: 'кофе' }),
        record({ id: 'tx-2', amountMinor: 1_800_000, note: 'такси' }),
      ],
    }));

    expect(text).toContain(`<b>${MINUS}18${NB}000 · Транспорт · «Такси»</b>`);
    expect(text).toMatch(/<i>Меняем «Такси»\. Что именно\?<\/i>$/);
  });

  it('says a transfer does not count as spending', () => {
    const text = formatRecordMessage(input({
      records: [record({ semanticType: 'own_transfer', categoryName: 'Другое', note: 'перевёл на Humo', amountMinor: 50_000_000 })],
    }));

    expect(text).toContain('\nНе входит в расходы.');
  });

  it('escapes what people typed so it cannot break the message', () => {
    const text = formatRecordMessage(input({ records: [record({ note: '<b>кофе</b> & чай' })], heard: '<i>кофе</i>' }));

    expect(text).toContain('«&lt;b&gt;кофе&lt;/b&gt; &amp; чай»');
    expect(text).toContain('Расслышал: «&lt;i&gt;кофе&lt;/i&gt;»');
  });

  it('has no emoji in any state', () => {
    for (const mode of ['confirm', 'edit', 'category', 'account', 'date', 'amount'] as const) {
      const value = input({ mode, heard: 'такси' });
      expect(formatRecordMessage(value)).not.toMatch(EMOJI);
      expect(labels(value).flat().join(' ')).not.toMatch(EMOJI);
    }
    const cancelled = input({ records: [record({ cancelled: true })] });
    expect(formatRecordMessage(cancelled)).not.toMatch(EMOJI);
    expect(labels(cancelled).flat().join(' ')).not.toMatch(EMOJI);
  });
});

describe('BotKeyboard under a record (FT-122)', () => {
  it('one record: «Изменить | Отменить»', () => {
    expect(labels(input())).toEqual([['Изменить', 'Отменить']]);
    expect(data(input())).toEqual([['r:e', 'r:x']]);
  });

  it('several records: a button per record, amount first, then «Отменить все»', () => {
    const value = input({
      records: [
        record({ id: 'tx-1', amountMinor: 2_500_000, categoryName: 'Кафе', note: 'кофе' }),
        record({ id: 'tx-2', amountMinor: 4_500_000, categoryName: 'Кафе', note: 'обед' }),
      ],
    });

    expect(labels(value)).toEqual([[`${MINUS}25${NB}000 · «Кофе»`], [`${MINUS}45${NB}000 · «Обед»`], ['Отменить все']]);
    expect(data(value)).toEqual([['r:p:0'], ['r:p:1'], ['r:x']]);
  });

  it('several records with one cancelled: «Вернуть «…»» for it', () => {
    const value = input({
      records: [
        record({ id: 'tx-1', amountMinor: 2_500_000, categoryName: 'Кафе', note: 'кофе' }),
        record({ id: 'tx-2', amountMinor: 1_800_000, note: 'такси', cancelled: true }),
      ],
    });

    expect(labels(value)).toEqual([[`${MINUS}25${NB}000 · «Кофе»`], ['Вернуть «Такси»'], ['Отменить все']]);
    expect(data(value)).toEqual([['r:p:0'], ['r:v:1'], ['r:x']]);
  });

  it('«Изменить»: every field within reach, the app link alone in its row, cancel last', () => {
    const value = input({ mode: 'edit' });

    expect(labels(value)).toEqual([
      ['Сумму', 'Категорию'],
      ['Счёт', 'Дату'],
      ['Открыть в Daftar ↗'],
      ['Готово'],
      ['Отменить запись'],
    ]);
    expect(data(value)).toEqual([
      ['r:f:amount', 'r:f:category'],
      ['r:f:account', 'r:f:date'],
      ['link:https://miniapp.test/?record=tx-1&userId=131184740'],
      ['r:ok'],
      ['r:x'],
    ]);
    for (const row of rows(value)) expect(row.length).toBeLessThanOrEqual(2);
  });

  it('«Изменить» has no «Счёт» when there is nothing to choose from, and no link without the Mini App', () => {
    const value = input({ mode: 'edit', accounts: [ACCOUNTS[0], ACCOUNTS[2]], recordUrl: () => undefined });

    expect(labels(value)).toEqual([['Сумму', 'Категорию'], ['Дату'], ['Готово'], ['Отменить запись']]);
  });

  it('«Изменить» on one of several cancels only that one', () => {
    const value = input({
      mode: 'edit',
      state: { selected: 1, guessed: [] },
      records: [record({ id: 'tx-1', note: 'кофе' }), record({ id: 'tx-2', note: 'такси' })],
    });

    expect(labels(value)[labels(value).length - 1]).toEqual(['Отменить «Такси»']);
    expect(data(value)[2]).toEqual(['link:https://miniapp.test/?record=tx-2&userId=131184740']);
  });

  it('categories two in a row, the current one ticked, «Это доход | ‹ Назад» last', () => {
    const value = input({ mode: 'category' });

    expect(labels(value)).toEqual([
      ['Продукты', 'Кафе'],
      ['✓ Транспорт', 'Дом'],
      ['Связь', 'Здоровье'],
      ['Покупки', 'Другое'],
      ['Это доход', '‹ Назад'],
    ]);
    expect(data(value)[0]).toEqual(['r:c:cat-groceries', 'r:c:cat-cafe']);
    expect(data(value)[4]).toEqual(['r:t', 'r:b']);
  });

  it('«Это доход» shows the income categories and offers «Это расход»; a guessed category is not ticked', () => {
    const value = input({ mode: 'category', state: { selected: 0, guessed: [], pickType: 'income' } });

    expect(labels(value)).toEqual([
      ['Зарплата', 'Фриланс'],
      ['Бизнес', 'Проценты'],
      ['Кэшбэк', 'Подарки'],
      ['Возврат', 'Другое'],
      ['Это расход', '‹ Назад'],
    ]);
    const guessed = input({ mode: 'category', state: { selected: 0, guessed: ['tx-1'] } });
    expect(labels(guessed).flat()).not.toContain('✓ Транспорт');
  });

  it('accounts of the record’s currency, the current one ticked', () => {
    const value = input({ mode: 'account' });

    expect(labels(value)).toEqual([['✓ Наличные', 'Карта'], ['‹ Назад']]);
    expect(data(value)).toEqual([['r:a:acc-cash', 'r:a:acc-card'], ['r:b']]);
  });

  it('dates: today, yesterday, the day before, another date in the app', () => {
    const value = input({ mode: 'date', records: [record({ date: '2026-10-13' })] });

    expect(labels(value)).toEqual([['Сегодня', '✓ Вчера'], ['Позавчера'], ['Другая дата ↗'], ['‹ Назад']]);
    expect(data(value)).toEqual([
      ['r:d:2026-10-14', 'r:d:2026-10-13'],
      ['r:d:2026-10-12'],
      ['link:https://miniapp.test/?record=tx-1&userId=131184740'],
      ['r:b'],
    ]);
  });

  it('the amount question has only «‹ Назад»', () => {
    expect(labels(input({ mode: 'amount' }))).toEqual([['‹ Назад']]);
  });

  it('a cancelled record: «Вернуть»; several: «Вернуть все»', () => {
    expect(labels(input({ records: [record({ cancelled: true })] }))).toEqual([['Вернуть']]);
    expect(data(input({ records: [record({ cancelled: true })] }))).toEqual([['r:v']]);
    expect(labels(input({ records: [record({ id: 'a', cancelled: true }), record({ id: 'b', cancelled: true })] }))).toEqual([['Вернуть все']]);
  });

  it('keeps every callback within Telegram’s 64 bytes', () => {
    const uuid = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    const value = input({
      mode: 'category',
      categories: [{ id: uuid, name: 'Кафе', type: 'expense' }],
      records: [record({ categoryId: uuid })],
    });

    for (const button of rows(value).flat()) {
      if (button.callback_data) expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
    }
  });
});
