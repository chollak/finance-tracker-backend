import {
  AUDIT_RULES,
  AuditCandidate,
  AuditRecord,
  auditRecordsOf,
  findAuditCandidates,
  firstWholeMonth,
  isSameAuditSpending,
  isSameSpending,
  spendingNoteKey,
} from '../src/modules/audit/domain/auditRules';
import { Transaction } from '../src/modules/transaction/domain/transactionEntity';
import { PROTOTYPE_CATEGORIES, prototypeRecords } from './helpers/auditPrototype';

const NBSP = ' ';
/** The texts use non-breaking spaces in numbers and before «сум»; the expectations are written with plain ones. */
const plain = (text: string) => text.replace(/ /g, ' ');
const sum = (value: number) => value * 100;

type Code = keyof typeof PROTOTYPE_CATEGORIES;

/** A record of one of the board's categories, amount in whole сум. */
function rec(date: string, code: Code, amount: number, note: string, id = `${date}-${note}-${amount}`): AuditRecord {
  const category = PROTOTYPE_CATEGORIES[code];
  return { id, date, amountMinor: sum(amount), categoryId: category.id, categoryName: category.name, categoryPresetKey: category.presetKey, note };
}

/** `count` records of the same spending on consecutive days from the 1st. */
function times(month: string, code: Code, count: number, amount: number, note: string): AuditRecord[] {
  return Array.from({ length: count }, (_, i) => rec(`${month}-${String(i + 1).padStart(2, '0')}`, code, amount, note, `${month}-${note}-${i}`));
}

const audit = (records: AuditRecord[], month = '2026-09', firstRecordDate: string | null = '2026-08-01') =>
  findAuditCandidates({ month, records, firstRecordDate });

/** What the card shows: kind and category, title, amount, reason. */
const card = (candidate: AuditCandidate) => ({
  kind: `${candidate.kindLabel} · ${candidate.categoryName}`,
  title: plain(candidate.title),
  amount: candidate.amountMinor / 100,
  reason: plain(candidate.reason),
});

/** FT-130: design-system «Ревизия трат» — who becomes a candidate, by which rule, and why, in words with numbers. */
describe('spending audit rules (FT-130)', () => {
  describe('on the board «Ревизия трат»: September against August', () => {
    const candidates = audit(prototypeRecords());

    it('finds the six candidates of the board, largest first, with their kinds, titles, sums and reasons', () => {
      expect(candidates.map(card)).toEqual([
        {
          kind: 'Стало чаще · Кафе',
          title: 'Доставка еды — 4 раза',
          amount: 732000,
          reason: 'В августе — 2 раза на 352 000 сум: вдвое чаще и на 380 000 сум больше.',
        },
        { kind: 'Крупная покупка · Покупки', title: 'Наушники', amount: 690000, reason: 'Самая крупная покупка сентября, 6 сентября.' },
        {
          kind: 'Часто и понемногу · Кафе',
          title: 'Кофе — 16 раз',
          amount: 448000,
          reason: 'В среднем 28 000 сум за раз. В августе — 9 раз на 243 000 сум.',
        },
        {
          kind: 'Часто и понемногу · Транспорт',
          title: 'Такси — 13 раз',
          amount: 349000,
          reason: 'В среднем 27 000 сум за раз. В августе — 6 раз на 160 000 сум.',
        },
        {
          kind: 'Платный тариф · Связь',
          title: 'Второй номер',
          amount: 50000,
          reason: 'Списывается каждый месяц: в августе и в сентябре по 50 000 сум.',
        },
        {
          kind: 'Подписка · Связь',
          title: 'Кинопоиск',
          amount: 50000,
          reason: 'Списывается каждый месяц: в августе и в сентябре по 50 000 сум.',
        },
      ]);
    });

    it('adds up to the board\'s «2 319 000 сум за сентябрь»', () => {
      expect(candidates.reduce((total, candidate) => total + candidate.amountMinor, 0)).toBe(sum(2319000));
    });

    it('tells what repeats from what happened once: the plan counts the month of a repeating spending, a purchase none', () => {
      const byName = Object.fromEntries(candidates.map(candidate => [candidate.name, candidate]));
      expect(byName['Кофе']).toMatchObject({ kind: 'frequent_small', recurring: true, monthlyMinor: sum(448000), count: 16 });
      expect(byName['Доставка еды']).toMatchObject({ kind: 'more_often', recurring: true, monthlyMinor: sum(732000), previous: { count: 2, amountMinor: sum(352000) } });
      expect(byName['Кинопоиск']).toMatchObject({ kind: 'subscription', recurring: true, monthlyMinor: sum(50000), serviceKey: 'kinopoisk' });
      expect(byName['Второй номер']).toMatchObject({ kind: 'tariff', recurring: true, monthlyMinor: sum(50000), serviceKey: 'second-number' });
      expect(byName['Наушники']).toMatchObject({ kind: 'large_purchase', recurring: false, monthlyMinor: 0, count: 1 });
    });

    it('lists the operations of the month, newest first; a purchase is just itself', () => {
      const delivery = candidates.find(candidate => candidate.name === 'Доставка еды')!;
      expect(delivery.operations.map(operation => [operation.date, operation.amountMinor / 100])).toEqual([
        ['2026-09-26', 190000], ['2026-09-18', 176000], ['2026-09-11', 186000], ['2026-09-06', 180000],
      ]);
      const headphones = candidates.find(candidate => candidate.name === 'Наушники')!;
      expect(headphones.operations).toHaveLength(1);
      expect(headphones.operations[0]).toMatchObject({ date: '2026-09-06', amountMinor: sum(690000) });
    });

    it('writes numbers with non-breaking spaces, as everywhere in Kapelka', () => {
      const coffee = candidates.find(candidate => candidate.name === 'Кофе')!;
      expect(coffee.reason).toContain(`28${NBSP}000${NBSP}сум`);
      expect(coffee.title).toBe(`Кофе — 16${NBSP}раз`);
    });
  });

  describe('only flexible categories: кафе, транспорт, покупки, связь, другое', () => {
    it('names them by starter key, so a renamed one stays flexible', () => {
      expect([...AUDIT_RULES.flexiblePresetKeys].sort()).toEqual(['cafe', 'other', 'shopping', 'telecom', 'transport']);
      const renamed = times('2026-09', 'kf', 8, 30000, 'Кофе').map(record => ({ ...record, categoryName: 'Кофейни' }));
      expect(audit(renamed).map(card)[0].kind).toBe('Часто и понемногу · Кофейни');
    });

    it('never offers groceries, home, health or the user\'s own categories, whatever the numbers', () => {
      const own = (record: AuditRecord): AuditRecord => ({ ...record, categoryId: 'cat-own', categoryName: 'Кальян', categoryPresetKey: null });
      const records = [
        ...times('2026-09', 'pr', 12, 20000, 'Хлеб'),
        ...times('2026-09', 'zd', 10, 30000, 'Аптека'),
        rec('2026-09-14', 'dm', 900000, 'Шторы'),
        rec('2026-09-15', 'zd', 50000, 'Кинопоиск'),
        ...times('2026-09', 'kf', 10, 50000, 'Кальян').map(own),
      ];
      expect(audit(records)).toEqual([]);
      // The same spending in a flexible category is a candidate
      expect(audit(times('2026-09', 'kf', 12, 20000, 'Хлеб')).map(candidate => candidate.kind)).toEqual(['frequent_small']);
    });
  });

  describe('«Часто и понемногу»: from 8 times, on average up to 60 000 сум', () => {
    it('takes 8 times at exactly 60 000 сум on average', () => {
      const [candidate] = audit(times('2026-09', 'tr', 8, 60000, 'Такси'));
      expect(card(candidate)).toEqual({
        kind: 'Часто и понемногу · Транспорт',
        title: 'Такси — 8 раз',
        amount: 480000,
        reason: 'В среднем 60 000 сум за раз. В августе таких трат не было.',
      });
    });

    it('leaves 7 times, or an average above 60 000 сум', () => {
      expect(audit(times('2026-09', 'tr', 7, 30000, 'Такси'))).toEqual([]);
      const above = times('2026-09', 'tr', 8, 60000, 'Такси');
      above[0] = { ...above[0], amountMinor: above[0].amountMinor + 800 };
      expect(audit(above)).toEqual([]);
    });

    it('ignores zero and negative amounts: they are not a time spent', () => {
      const seven = times('2026-09', 'kf', 7, 30000, 'Кофе');
      expect(audit([...seven, rec('2026-09-20', 'kf', 0, 'Кофе')])).toEqual([]);
      expect(audit([...seven, rec('2026-09-21', 'kf', -30000, 'Кофе')])).toEqual([]);
      // Nor in the month before: «таких трат не было» stays true
      const [candidate] = audit([rec('2026-08-20', 'kf', 0, 'Кофе'), ...seven, rec('2026-09-22', 'kf', 30000, 'Кофе')]);
      expect(plain(candidate.reason)).toBe('В среднем 30 000 сум за раз. В августе таких трат не было.');
    });

    it('rounds the average to a thousand and gives it without «≈»', () => {
      const records = [...times('2026-09', 'kf', 9, 25000, 'Кофе'), rec('2026-09-20', 'kf', 31000, 'Кофе')];
      // 256 000 / 10 = 25 600 → 26 000
      expect(plain(audit(records)[0].reason)).toBe('В среднем 26 000 сум за раз. В августе таких трат не было.');
    });

    it('says nothing about the month before when that month was not recorded', () => {
      expect(plain(audit(times('2026-09', 'kf', 8, 25000, 'Кофе'), '2026-09', '2026-09-01')[0].reason)).toBe('В среднем 25 000 сум за раз.');
    });
  });

  describe('«Стало чаще»: twice as often as the month before and from 300 000 сум', () => {
    const before = times('2026-08', 'kf', 2, 140000, 'Доставка еды');

    it('takes twice as often at exactly 300 000 сум', () => {
      const [candidate] = audit([...before, ...times('2026-09', 'kf', 4, 75000, 'Доставка еды')]);
      expect(card(candidate)).toEqual({
        kind: 'Стало чаще · Кафе',
        title: 'Доставка еды — 4 раза',
        amount: 300000,
        reason: 'В августе — 2 раза на 280 000 сум: вдвое чаще и на 20 000 сум больше.',
      });
    });

    it('leaves less than twice as often, less than 300 000 сум, nothing the month before, or less money than before', () => {
      expect(audit([...before, ...times('2026-09', 'kf', 3, 120000, 'Доставка еды')])).toEqual([]);
      expect(audit([...before, ...times('2026-09', 'kf', 4, 74750, 'Доставка еды')])).toEqual([]);
      expect(audit(times('2026-09', 'kf', 4, 90000, 'Доставка еды'))).toEqual([]);
      // Twice as often but cheaper: «на … больше» would not be true
      const cheaper = times('2026-08', 'kf', 2, 400000, 'Доставка еды');
      expect(audit([...cheaper, ...times('2026-09', 'kf', 4, 100000, 'Доставка еды')])).toEqual([]);
    });

    it('says how many times more often in words', () => {
      const once = [rec('2026-08-03', 'dr', 100000, 'Стрижка')];
      const reason = (count: number) => plain(audit([...once, ...times('2026-09', 'dr', count, 100000, 'Стрижка')])[0].reason);
      expect(reason(3)).toBe('В августе — 1 раз на 100 000 сум: втрое чаще и на 200 000 сум больше.');
      expect(reason(4)).toBe('В августе — 1 раз на 100 000 сум: вчетверо чаще и на 300 000 сум больше.');
      expect(reason(5)).toBe('В августе — 1 раз на 100 000 сум: в 5 раз чаще и на 400 000 сум больше.');
    });
  });

  describe('the month before is compared only when it was recorded from its start', () => {
    // Recording began on 25 October: the first whole month is November, so October is known only in part
    const late = '2026-10-25';
    const weekly = [rec('2026-10-25', 'kf', 150000, 'Доставка еды'), ...['01', '08', '15', '22'].map(day => rec(`2026-11-${day}`, 'kf', 150000, 'Доставка еды'))];

    it('counts a month recorded from one of its first 3 days as whole, a later start from the next month', () => {
      expect(AUDIT_RULES.wholeMonthStartDays).toBe(3);
      expect(firstWholeMonth('2026-10-01')).toBe('2026-10');
      expect(firstWholeMonth('2026-10-03')).toBe('2026-10');
      expect(firstWholeMonth('2026-10-04')).toBe('2026-11');
      expect(firstWholeMonth(late)).toBe('2026-11');
      expect(firstWholeMonth('2026-12-20')).toBe('2027-01');
      expect(firstWholeMonth(null)).toBeNull();
    });

    it('is no «Стало чаще» against a month recorded in part: the same pace is not «вчетверо чаще»', () => {
      expect(audit(weekly, '2026-11', late)).toEqual([]);
      // The same records with October recorded whole are a true statement
      expect(audit(weekly, '2026-11', '2026-10-01').map(card)).toEqual([
        {
          kind: 'Стало чаще · Кафе',
          title: 'Доставка еды — 4 раза',
          amount: 600000,
          reason: 'В октябре — 1 раз на 150 000 сум: вчетверо чаще и на 450 000 сум больше.',
        },
      ]);
    });

    it('says nothing about such a month: no «таких трат не было», no comparison, no «новая подписка»', () => {
      const records = [...times('2026-11', 'kf', 8, 25000, 'Кофе'), rec('2026-11-10', 'sv', 60000, 'Netflix')];
      const candidates = audit(records, '2026-11', late);
      expect(candidates.map(card)).toEqual([
        { kind: 'Часто и понемногу · Кафе', title: 'Кофе — 8 раз', amount: 200000, reason: 'В среднем 25 000 сум за раз.' },
        { kind: 'Подписка · Связь', title: 'Netflix', amount: 60000, reason: 'Списание 10 ноября — 60 000 сум.' },
      ]);
      expect(candidates.map(candidate => candidate.previous)).toEqual([null, null]);
    });

    it('compares a month begun on its 3rd day, not on its 4th', () => {
      const coffee = times('2026-11', 'kf', 8, 25000, 'Кофе');
      expect(plain(audit(coffee, '2026-11', '2026-10-03')[0].reason)).toBe('В среднем 25 000 сум за раз. В октябре таких трат не было.');
      expect(plain(audit(coffee, '2026-11', '2026-10-04')[0].reason)).toBe('В среднем 25 000 сум за раз.');
    });
  });

  describe('«Крупная покупка»: from 600 000 сум, once, among purchases and other', () => {
    it('takes a purchase of exactly 600 000 сум; the largest of the month says so', () => {
      const records = [rec('2026-09-20', 'pk', 600000, 'Часы'), rec('2026-09-21', 'dr', 700000, 'Подарок на свадьбу')];
      expect(audit(records).map(card)).toEqual([
        { kind: 'Крупная покупка · Другое', title: 'Подарок на свадьбу', amount: 700000, reason: 'Самая крупная покупка сентября, 21 сентября.' },
        { kind: 'Крупная покупка · Покупки', title: 'Часы', amount: 600000, reason: 'Крупная покупка, 20 сентября.' },
      ]);
    });

    it('leaves 599 999 сум, and large spending outside purchases and other', () => {
      expect(audit([rec('2026-09-20', 'pk', 599999, 'Часы')])).toEqual([]);
      expect(audit([rec('2026-09-20', 'kf', 900000, 'Банкет'), rec('2026-09-21', 'tr', 800000, 'Билеты')])).toEqual([]);
    });

    it('is the one purchase, not the sum of a group', () => {
      const [candidate] = audit([rec('2026-09-02', 'pk', 300000, 'Одежда'), rec('2026-09-20', 'pk', 650000, 'Одежда')]);
      expect(card(candidate)).toEqual({ kind: 'Крупная покупка · Покупки', title: 'Одежда', amount: 650000, reason: 'Самая крупная покупка сентября, 20 сентября.' });
      expect(candidate.operations.map(operation => operation.date)).toEqual(['2026-09-20']);
    });
  });

  describe('«Подписка» and «Платный тариф» by the catalog of services', () => {
    it('a new one: the first charge of the month', () => {
      const [candidate] = audit([rec('2026-09-03', 'sv', 60000, 'Подписка Netflix')]);
      expect(card(candidate)).toEqual({ kind: 'Подписка · Связь', title: 'Netflix', amount: 60000, reason: 'Новая подписка: первое списание 3 сентября.' });
      const [tariff] = audit([rec('2026-09-04', 'sv', 50000, 'второй номер')]);
      expect(plain(tariff.reason)).toBe('Новый тариф: первое списание 4 сентября.');
    });

    it('one that went up or down by more than 10%', () => {
      const up = audit([rec('2026-08-05', 'sv', 45000, 'Кинопоиск'), rec('2026-09-05', 'sv', 50000, 'Кинопоиск')]);
      expect(plain(up[0].reason)).toBe('Подорожала: в августе — 45 000 сум, в сентябре — 50 000 сум.');
      const down = audit([rec('2026-08-05', 'sv', 300000, 'ChatGPT Plus'), rec('2026-09-05', 'dr', 250000, 'chatgpt')]);
      expect(card(down[0])).toEqual({ kind: 'Подписка · Другое', title: 'ChatGPT', amount: 250000, reason: 'Подешевела: в августе — 300 000 сум, в сентябре — 250 000 сум.' });
      const tariff = audit([rec('2026-08-03', 'sv', 40000, 'Второй номер'), rec('2026-09-03', 'sv', 50000, 'Второй номер')]);
      expect(plain(tariff[0].reason)).toBe('Подорожал: в августе — 40 000 сум, в сентябре — 50 000 сум.');
    });

    it('one charged every month: the same price, or both prices when they differ by 10% or less', () => {
      const same = audit([rec('2026-08-05', 'sv', 50000, 'Кинопоиск'), rec('2026-09-05', 'sv', 50000, 'Кинопоиск')]);
      expect(plain(same[0].reason)).toBe('Списывается каждый месяц: в августе и в сентябре по 50 000 сум.');
      const close = audit([rec('2026-08-05', 'sv', 46000, 'Кинопоиск'), rec('2026-09-05', 'sv', 50000, 'Кинопоиск')]);
      expect(plain(close[0].reason)).toBe('Списывается каждый месяц: в августе — 46 000 сум, в сентябре — 50 000 сум.');
      // Exactly 10% either way is still «каждый месяц»; a сум more is «подорожала»
      const tenUp = audit([rec('2026-08-05', 'sv', 50000, 'Кинопоиск'), rec('2026-09-05', 'sv', 55000, 'Кинопоиск')]);
      expect(plain(tenUp[0].reason)).toBe('Списывается каждый месяц: в августе — 50 000 сум, в сентябре — 55 000 сум.');
      const tenDown = audit([rec('2026-08-05', 'sv', 50000, 'Кинопоиск'), rec('2026-09-05', 'sv', 45000, 'Кинопоиск')]);
      expect(plain(tenDown[0].reason)).toBe('Списывается каждый месяц: в августе — 50 000 сум, в сентябре — 45 000 сум.');
      const above = audit([rec('2026-08-05', 'sv', 50000, 'Кинопоиск'), rec('2026-09-05', 'sv', 55001, 'Кинопоиск')]);
      expect(plain(above[0].reason)).toBe('Подорожала: в августе — 50 000 сум, в сентябре — 55 001 сум.');
    });

    it('takes everything charged in the month, not the price of one charge', () => {
      const twice = [rec('2026-09-05', 'sv', 50000, 'Кинопоиск'), rec('2026-09-20', 'sv', 50000, 'Кинопоиск')];
      const [candidate] = audit([rec('2026-08-05', 'sv', 50000, 'Кинопоиск'), ...twice]);
      expect(card(candidate)).toEqual({ kind: 'Подписка · Связь', title: 'Кинопоиск', amount: 100000, reason: 'Подорожала: в августе — 50 000 сум, в сентябре — 100 000 сум.' });
      expect(candidate).toMatchObject({ count: 2, monthlyMinor: sum(100000) });
      expect(plain(audit(twice, '2026-09', '2026-09-01')[0].reason)).toBe('В сентябре — 2 раза на 100 000 сум.');
    });

    it('is new only when it was never charged before: a yearly or paused one just tells its charge', () => {
      // Telegram Premium for a year: charged last September, recorded since then
      const yearly = audit([rec('2025-09-10', 'sv', 400000, 'Telegram Premium на год'), rec('2026-09-10', 'sv', 400000, 'Telegram Premium на год')], '2026-09', '2025-09-01');
      expect(card(yearly[0])).toEqual({ kind: 'Подписка · Связь', title: 'Telegram Premium', amount: 400000, reason: 'Списание 10 сентября — 400 000 сум.' });
      // What a month of it costs is the charge spread over the months since the one before
      expect(yearly[0]).toMatchObject({ recurring: true, monthlyMinor: Math.round(sum(400000) / 12), previous: { count: 0, amountMinor: 0 } });
      // Paused for August
      const paused = audit([rec('2026-07-05', 'sv', 50000, 'Кинопоиск'), rec('2026-09-05', 'sv', 50000, 'Кинопоиск')], '2026-09', '2026-07-01');
      expect(plain(paused[0].reason)).toBe('Списание 5 сентября — 50 000 сум.');
      expect(paused[0].monthlyMinor).toBe(sum(25000));
    });

    it('reads earlier charges of a service in any category, its own or not flexible', () => {
      const own = (record: AuditRecord): AuditRecord => ({ ...record, categoryId: 'cat-own', categoryName: 'Подписки', categoryPresetKey: null });
      const inOwn = audit([own(rec('2026-08-05', 'sv', 50000, 'Кинопоиск')), rec('2026-09-05', 'sv', 50000, 'Кинопоиск')]);
      expect(card(inOwn[0])).toEqual({ kind: 'Подписка · Связь', title: 'Кинопоиск', amount: 50000, reason: 'Списывается каждый месяц: в августе и в сентябре по 50 000 сум.' });
      expect(inOwn[0].previous).toEqual({ count: 1, amountMinor: sum(50000) });
      const inHealth = audit([rec('2026-08-05', 'zd', 45000, 'Кинопоиск'), rec('2026-09-05', 'sv', 50000, 'Кинопоиск')]);
      expect(plain(inHealth[0].reason)).toBe('Подорожала: в августе — 45 000 сум, в сентябре — 50 000 сум.');
      // A charge of the month in a category that is not flexible is still no candidate
      expect(audit([rec('2026-08-05', 'sv', 50000, 'Кинопоиск'), own(rec('2026-09-05', 'sv', 50000, 'Кинопоиск'))])).toEqual([]);
    });

    it('without the month before: just the charge', () => {
      const [candidate] = audit([rec('2026-09-12', 'sv', 41000, 'Telegram Premium')], '2026-09', '2026-09-01');
      expect(card(candidate)).toEqual({ kind: 'Подписка · Связь', title: 'Telegram Premium', amount: 41000, reason: 'Списание 12 сентября — 41 000 сум.' });
    });

    it('needs a charge in the month: one cancelled last month is no candidate', () => {
      expect(audit([rec('2026-08-05', 'sv', 50000, 'Кинопоиск')])).toEqual([]);
    });

    it('goes before the other rules, and a cheap frequent spending of a service stays a subscription', () => {
      const [candidate] = audit(times('2026-09', 'dr', 9, 10000, 'Яндекс Музыка'));
      expect(candidate.kind).toBe('subscription');
      expect(candidate.amountMinor).toBe(sum(90000));
    });
  });

  describe('one spending under different notes is one group in both months', () => {
    it('counts «Такси домой» and «Такси в аэропорт» with «Такси» in October (the board\'s goals)', () => {
      const candidates = audit(prototypeRecords(), '2026-10', '2026-08-01');
      const taxi = candidates.find(candidate => candidate.categoryName === 'Транспорт' && candidate.name === 'Такси')!;
      expect(card(taxi)).toEqual({
        kind: 'Часто и понемногу · Транспорт',
        title: 'Такси — 8 раз',
        amount: 262400,
        reason: 'В среднем 33 000 сум за раз. В сентябре — 13 раз на 349 000 сум.',
      });
      expect(taxi.operations.map(operation => operation.amountMinor / 100)).toEqual([24000, 32000, 85000, 21000, 34000, 26000, 18400, 22000]);
    });

    it('groups the month before the same way, whatever the case, «ё» and punctuation', () => {
      const records = [
        rec('2026-08-02', 'tr', 90000, 'Такси в аэропорт'),
        rec('2026-08-09', 'tr', 60000, 'такси, до работы'),
        rec('2026-09-01', 'tr', 150000, 'Такси'),
        rec('2026-09-08', 'tr', 50000, 'такси домой'),
        rec('2026-09-15', 'tr', 60000, 'ТАКСИ ночью'),
        rec('2026-09-22', 'tr', 70000, 'Такси  домой'),
      ];
      const [candidate] = audit(records);
      expect(card(candidate)).toEqual({
        kind: 'Стало чаще · Транспорт',
        title: 'Такси — 4 раза',
        amount: 330000,
        reason: 'В августе — 2 раза на 150 000 сум: вдвое чаще и на 180 000 сум больше.',
      });
      expect(candidate.previous).toEqual({ count: 2, amountMinor: sum(150000) });
    });

    it('takes the group\'s root from the month before too: «Такси» of August gathers September\'s notes', () => {
      const records = [
        rec('2026-08-10', 'tr', 30000, 'Такси'),
        ...times('2026-09', 'tr', 4, 25000, 'Такси домой'),
        ...times('2026-09', 'tr', 4, 25000, 'Такси на работу'),
      ];
      const candidates = audit(records);
      expect(candidates.map(card)).toEqual([
        {
          kind: 'Часто и понемногу · Транспорт',
          title: 'Такси — 8 раз',
          amount: 200000,
          reason: 'В среднем 25 000 сум за раз. В августе — 1 раз на 30 000 сум.',
        },
      ]);
      expect(candidates[0].key).toBe('cat-transport|такси');
    });

    it('keeps the key within one audit; across audits the same spending is matched by its notes', () => {
      const records = [
        ...times('2026-08', 'tr', 2, 20000, 'Такси домой'),
        ...times('2026-09', 'tr', 8, 20000, 'Такси домой'),
        ...times('2026-10', 'tr', 4, 20000, 'Такси'),
        ...times('2026-10', 'tr', 4, 20000, 'Такси домой'),
        ...times('2026-10', 'kf', 8, 20000, 'Кофе'),
        rec('2026-09-05', 'sv', 50000, 'Кинопоиск'),
        rec('2026-10-05', 'dr', 50000, 'кинопоиск, подписка'),
      ];
      const september = audit(records, '2026-09', '2026-08-01');
      const october = audit(records, '2026-10', '2026-08-01');
      const taxiOf = (candidates: AuditCandidate[]) => candidates.find(candidate => candidate.categoryName === 'Транспорт')!;
      // The root of a group depends on the notes of the two months compared
      expect(taxiOf(september)).toMatchObject({ key: 'cat-transport|такси домой', name: 'Такси домой' });
      expect(taxiOf(october)).toMatchObject({ key: 'cat-transport|такси', name: 'Такси' });
      expect(isSameAuditSpending(taxiOf(september), taxiOf(october))).toBe(true);
      expect(isSameAuditSpending(taxiOf(october), taxiOf(september))).toBe(true);
      // A service by its key, whatever the category of its charge
      const kinopoiskOf = (candidates: AuditCandidate[]) => candidates.find(candidate => candidate.serviceKey === 'kinopoisk')!;
      expect(kinopoiskOf(september).categoryName).toBe('Связь');
      expect(kinopoiskOf(october).categoryName).toBe('Другое');
      expect(isSameAuditSpending(kinopoiskOf(september), kinopoiskOf(october))).toBe(true);
      // Different spending is not the same
      const coffee = october.find(candidate => candidate.name === 'Кофе')!;
      expect(isSameAuditSpending(taxiOf(september), coffee)).toBe(false);
      expect(isSameAuditSpending(kinopoiskOf(september), coffee)).toBe(false);
      expect(isSameAuditSpending(taxiOf(september), { ...taxiOf(october), categoryId: 'cat-other' })).toBe(false);
      expect(isSameAuditSpending({ categoryId: 'cat-transport', noteKey: 'такси', serviceKey: null }, { categoryId: 'cat-transport', noteKey: 'таксист', serviceKey: null })).toBe(false);
      expect(isSameAuditSpending({ categoryId: 'cat-cafe', noteKey: '', serviceKey: null }, { categoryId: 'cat-cafe', noteKey: 'кофе', serviceKey: null })).toBe(false);
    });

    it('keeps different spending that only begins alike apart, and categories apart', () => {
      const records = [
        ...times('2026-09', 'kf', 5, 30000, 'Доставка еды'),
        ...times('2026-09', 'kf', 5, 30000, 'Доставка цветов'),
        ...times('2026-09', 'tr', 4, 30000, 'Кофе'),
        ...times('2026-09', 'kf', 4, 30000, 'Кофе'),
      ];
      expect(audit(records)).toEqual([]);
    });

    it('takes records without a note, or with just the category\'s name, as one spending of the category', () => {
      const records = [...times('2026-09', 'kf', 5, 30000, ''), ...times('2026-09', 'kf', 3, 30000, 'кафе').map(record => ({ ...record, id: `${record.id}-k` }))];
      const [candidate] = audit(records);
      expect(card(candidate)).toEqual({
        kind: 'Часто и понемногу · Кафе',
        title: 'Кафе — 8 раз',
        amount: 240000,
        reason: 'В среднем 30 000 сум за раз. В августе таких трат не было.',
      });
    });

    it('names the group by its shortest note as last written, with a capital letter', () => {
      const records = [...times('2026-09', 'tr', 6, 20000, 'такси домой'), rec('2026-09-20', 'tr', 20000, 'такси'), rec('2026-09-25', 'tr', 20000, 'такси')];
      expect(audit(records)[0].name).toBe('Такси');
    });

    it('tells a note of a group from another', () => {
      const key = spendingNoteKey('Такси', 'Транспорт');
      expect(key).toBe('такси');
      expect(isSameSpending(spendingNoteKey('Такси в аэропорт', 'Транспорт'), key)).toBe(true);
      expect(isSameSpending(spendingNoteKey('ТАКСИ, домой', 'Транспорт'), key)).toBe(true);
      expect(isSameSpending(spendingNoteKey('Таксист', 'Транспорт'), key)).toBe(false);
      expect(spendingNoteKey('  Транспорт ', 'Транспорт')).toBe('');
      expect(spendingNoteKey('Ёлка', 'Покупки')).toBe('елка');
    });
  });

  describe('which records the audit reads', () => {
    const categories = Object.values(PROTOTYPE_CATEGORIES);
    const tx = (overrides: Partial<Transaction>): Transaction => ({
      id: 't1', userId: 'u1', date: '2026-09-05', type: 'expense', semanticType: 'expense', category: 'Кафе', categoryId: 'cat-cafe',
      description: 'Кофе', amount: 25000, amountMinor: sum(25000), currency: 'UZS', ...overrides,
    });

    it('reads real expenses with the starter key of their category and the note, else the merchant', () => {
      expect(auditRecordsOf([tx({}), tx({ id: 't2', description: '', merchant: 'Evos', date: '2026-09-06T10:00:00.000Z' })], { categories, usdRateMinor: null })).toEqual([
        { id: 't1', date: '2026-09-05', amountMinor: sum(25000), categoryId: 'cat-cafe', categoryName: 'Кафе', categoryPresetKey: 'cafe', note: 'Кофе' },
        { id: 't2', date: '2026-09-06', amountMinor: sum(25000), categoryId: 'cat-cafe', categoryName: 'Кафе', categoryPresetKey: 'cafe', note: 'Evos' },
      ]);
    });

    it('leaves out income, own money moving, debts and records awaiting review', () => {
      const records = [
        tx({ id: 'income', type: 'income', semanticType: 'income' }),
        tx({ id: 'transfer', semanticType: 'own_transfer' }),
        tx({ id: 'saving', semanticType: 'saving_deposit' }),
        tx({ id: 'debt', isDebtRelated: true }),
        tx({ id: 'review', needsReview: true }),
      ];
      expect(auditRecordsOf(records, { categories, usdRateMinor: null })).toEqual([]);
    });

    it('takes dollars at the rate and leaves them out without one', () => {
      const usd = tx({ id: 'usd', currency: 'USD', amountMinor: 2000, description: 'ChatGPT Plus' });
      expect(auditRecordsOf([usd], { categories, usdRateMinor: sum(12650) })[0].amountMinor).toBe(sum(253000));
      expect(auditRecordsOf([usd], { categories, usdRateMinor: null })).toEqual([]);
    });

    it('marks a category it does not know, or one of the user\'s own, as not flexible', () => {
      const [record] = auditRecordsOf([tx({ categoryId: 'cat-own', category: 'Кальян' })], { categories, usdRateMinor: null });
      expect(record).toMatchObject({ categoryId: 'cat-own', categoryName: 'Кальян', categoryPresetKey: null });
    });
  });
});
