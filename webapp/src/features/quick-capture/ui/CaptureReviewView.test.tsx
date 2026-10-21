import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import { addDays, toLocalDate } from '@/shared/lib/dates';
import { ROUTES } from '@/shared/lib/constants/routes';
import { MINUS, NBSP } from '@/shared/lib/money';
import { chooseAccount, removeItem, reviewModel, reviewSessionFrom, type ReviewContext, type ReviewSession } from '../model/captureReview';
import type { CapturedTransaction } from '../model/types';
import { CaptureReviewView } from './CaptureReviewView';

/**
 * FT-114, boards «Проверка записей» and «Проверка записей · тёмная»: the phrase, then one card per record —
 * the signed amount and its unit, the note, «×», and three chips: the category («Кафе ?» while it is the
 * AI's guess), the account and the date; one main button at the bottom. Rendered to static markup.
 */

const TODAY = toLocalDate(new Date());

const CATEGORIES: Category[] = [
  { id: 'c-cafe', type: 'expense', name: 'Кафе', color: 'rose', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'cafe' },
  { id: 'c-tr', type: 'expense', name: 'Транспорт', color: 'sky', isHidden: false, isOther: false, sortOrder: 30, presetKey: 'transport' },
  { id: 'c-fr', type: 'income', name: 'Фриланс', color: 'lilac', isHidden: false, isOther: false, sortOrder: 20, presetKey: 'freelance' },
];

const account = (id: string, name: string, currency: Account['currency'] = 'UZS'): Account => ({
  id, name, kind: 'card', currency, openingBalanceMinor: 0, openingDate: TODAY, isHidden: false, sortOrder: 10, balanceMinor: 0,
});

const CONTEXT: ReviewContext = {
  categories: CATEGORIES,
  accounts: [account('card', 'Карта'), account('cash', 'Наличные'), account('usd', 'Доллары', 'USD')],
  rateMinor: 1_265_000,
  today: TODAY,
};

const record = (overrides: Partial<CapturedTransaction>): CapturedTransaction => ({
  id: 'x', amount: 0, type: 'expense', semanticType: 'expense', category: 'Кафе', date: TODAY, needsReview: false,
  countsAsRealExpense: true, ...overrides,
});

const SESSION: ReviewSession = reviewSessionFrom(
  {
    status: 'saved',
    text: 'кофе 45, такси до работы 18 тысяч наличными, вчера пришло 300 долларов за лендинг',
    transactions: [
      record({
        id: 'a', amount: 45000, amountMinor: 4_500_000, categoryId: 'c-cafe', accountId: 'card', description: 'кофе',
        assumptions: [{ kind: 'thousands', written: '45', amount: 45000 }, { kind: 'category', name: 'Кафе' }],
      }),
      record({ id: 'b', amount: 18000, amountMinor: 1_800_000, categoryId: 'c-tr', accountId: 'cash', description: 'такси до работы' }),
      record({
        id: 'c', type: 'income', semanticType: 'income', amount: 300, amountMinor: 30_000, currency: 'USD', categoryId: 'c-fr',
        accountId: 'usd', description: 'за лендинг', date: addDays(TODAY, -1),
      }),
    ],
    debts: [],
    ack: { title: 'Записал', summary: '', actions: [] },
    review: { reasons: [] },
  },
  CATEGORIES
);

const noop = () => {};

function view(session: ReviewSession = SESSION): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[ROUTES.CAPTURE_REVIEW]}>
      <CaptureReviewView
        model={reviewModel(session, CONTEXT)}
        onEdit={noop}
        onSave={noop}
        onCategory={noop}
        onAccount={noop}
        onDate={noop}
        onRemove={noop}
        onConvert={noop}
      />
    </MemoryRouter>
  );
}

const buttons = (html: string) => [...html.matchAll(/<button [^>]*>.*?<\/button>/g)].map((match) => match[0]);
const button = (html: string, label: string) => buttons(html).find((tag) => tag.includes(`aria-label="${label}"`));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the review screen', () => {
  it('is headed «Проверьте записи» and quotes the phrase with how many records it made', () => {
    const html = view();

    expect(html).toMatch(/<h1[^>]*>Проверьте записи<\/h1>/);
    expect(html).toMatch(/<section[^>]*aria-label="Исходный текст"/);
    expect(text(html)).toContain('«кофе 45, такси до работы 18 тысяч наличными, вчера пришло 300 долларов за лендинг»');
    expect(text(html)).toContain('3 операции · 1 проверить');
  });

  it('offers «Изменить» to go back to the text', () => {
    expect(buttons(view()).find((tag) => tag.includes('>Изменить<'))).toMatch(/h-touch/);
  });

  it('has a card per record', () => {
    const html = view();

    expect(html).toMatch(/<ul[^>]*aria-label="Распознанные операции"/);
    expect(html.match(/<li[\s>]/g)).toHaveLength(3);
    expect(html).toMatch(/class="[^"]*rounded-card[^"]*bg-card/);
  });

  it('shows the signed amount in tabular figures with its unit, income in green', () => {
    const html = view();

    expect(html).toMatch(new RegExp(`<span class="[^"]*tabular-nums[^"]*text-ink[^"]*">${MINUS}45${NBSP}000</span><span[^>]*>сум</span>`));
    expect(html).toMatch(/<span class="[^"]*tabular-nums[^"]*text-income[^"]*">\+300,00<\/span><span[^>]*>USD<\/span>/);
  });

  it('takes a record out with «×»', () => {
    expect(button(view(), `Убрать: Кафе, ${MINUS}45${NBSP}000 сум`)).toMatch(/size-touch/);
  });
});

describe('the chips of a record', () => {
  it('draw the AI’s guess dashed with «?», and open the picker', () => {
    const chip = button(view(), 'Категория: Кафе, не уверен — проверьте. Изменить');

    expect(chip).toMatch(/aria-haspopup="dialog"/);
    expect(chip).toMatch(/border-dashed/);
    expect(chip).toMatch(/bg-transparent/);
    expect(chip).toMatch(/>Кафе<\/span><span aria-hidden="true"[^>]*>\?<\/span>/);
  });

  it('draw a sure category in its pastel with pastel ink', () => {
    const chip = button(view(), 'Категория: Транспорт. Изменить');

    expect(chip).toMatch(/bg-pastel-sky/);
    expect(chip).toMatch(/text-pastel-ink/);
    expect(chip).not.toMatch(/border-dashed/);
  });

  it('show the account and the date on the track, 44px pills', () => {
    const html = view();

    for (const label of ['Счёт: Наличные. Изменить', 'Дата: Сегодня. Изменить', 'Дата: Вчера, ' ]) {
      const chip = buttons(html).find((tag) => tag.includes(`aria-label="${label}`));
      expect(chip).toMatch(/h-touch/);
      expect(chip).toMatch(/rounded-pill/);
      expect(chip).toMatch(/bg-track/);
    }
  });
});

describe('what the parse assumed', () => {
  it('says «"45" понял как 45 000 сум» under the record', () => {
    expect(text(view())).toContain('«45» понял как 45 000 сум');
  });

  it('after an account of another currency: the number stayed, «Пересчитать» converts it', () => {
    const html = view(chooseAccount(SESSION, 'b', CONTEXT.accounts[2], CONTEXT.rateMinor).session);

    expect(html).toMatch(/role="status"[^>]*>.*Валюта сменилась, число осталось прежним/);
    expect(buttons(html).find((tag) => tag.includes('Пересчитать:'))).toMatch(/h-touch/);
  });
});

describe('the main button', () => {
  it('saves as many records as there are', () => {
    const save = buttons(view()).find((tag) => tag.includes('Сохранить 3 операции'));

    expect(save).toMatch(/h-button/);
    expect(save).not.toMatch(/disabled=""/);
  });

  it('says there is nothing to save once every record is taken out', () => {
    const empty = ['a', 'b', 'c'].reduce(removeItem, SESSION);
    const save = buttons(view(empty)).find((tag) => tag.includes('Нечего сохранять'));

    expect(save).toMatch(/disabled=""/);
    expect(text(view(empty))).toContain('Ничего не осталось');
  });
});
