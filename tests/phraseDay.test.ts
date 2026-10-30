import { phraseDayOf } from '../src/modules/voiceProcessing/domain/phraseDay';

/** FT-175: the day a phrase names, for the text fast paths, counted from the day it was said. */
describe('phraseDayOf', () => {
  const SAID_ON = '2026-10-27';

  it.each([
    ['такси 18000', 'такси 18000', SAID_ON],
    ['сегодня такси 18000', 'такси 18000', '2026-10-27'],
    ['вчера такси 18000', 'такси 18000', '2026-10-26'],
    ['такси 18000 позавчера', 'такси 18000', '2026-10-25'],
    ['Вчера такси 18000', 'такси 18000', '2026-10-26'],
    // Uzbek and English, as the semantic keywords read them
    ['kecha taksi 18000', 'taksi 18000', '2026-10-26'],
    ['bugun taksi 18000', 'taksi 18000', '2026-10-27'],
    ['кеча такси 18000', 'такси 18000', '2026-10-26'],
    ['yesterday taxi 18000', 'taxi 18000', '2026-10-26'],
    ['today taxi 18000', 'taxi 18000', '2026-10-27'],
  ])('reads «%s» as «%s» of %s', (text, rest, date) => {
    expect(phraseDayOf(text, SAID_ON)).toEqual({ text: rest, date });
  });

  it.each([
    ['вчера, такси 18000'],
    ['такси, вчера 18000'],
    ['вчера: такси 18000'],
    ['такси 18000, вчера'],
    ['такси (вчера) 18000'],
    ['вчера-такси 18000'],
    ['вчера — такси 18000'],
  ])('leaves no comma, bracket or dash of «%s» in the note', text => {
    expect(phraseDayOf(text, SAID_ON)).toEqual({ text: 'такси 18000', date: '2026-10-26' });
  });

  it.each([
    'в понедельник такси 18000',
    'такси 18000 в субботу',
    'завтра такси 18000',
    'неделю назад такси 18000',
    'на прошлой неделе такси 18000',
    'вчерашний обед 50000',
    'позавчерашний обед 50000',
    'на днях кофе 20000',
    'в выходные кино 80000',
    'вчера позавчера такси 18000',
    // English and Uzbek, and the short weekdays
    'tomorrow taxi 18000',
    'ertaga taksi 18000',
    'on monday taxi 18000',
    'Friday dinner 120000',
    'dushanba taksi 18000',
    'juma kuni kofe 25000',
    'yakshanba kino 80000',
    'last week taxi 18000',
    "o'tgan hafta taksi 18000",
    'oʻtgan hafta taksi 18000',
    'в пн такси 18000',
    'такси 18000 в сб',
  ])('leaves «%s» to the AI: it names a day the fast path does not read', text => {
    expect(phraseDayOf(text, SAID_ON)).toBeNull();
  });

  it.each([
    'аренда на ноябрь 3000000',
    'интернет март 100000',
    'подписка на май 50000',
  ])('keeps «%s» on the fast path: a month alone is a period, not a day', text => {
    expect(phraseDayOf(text, SAID_ON)).toEqual({ text, date: SAID_ON });
  });
});
