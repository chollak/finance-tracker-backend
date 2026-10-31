import { lessonWordsOf, merchantKey } from '../src/modules/voiceProcessing/domain/lessonWords';

/**
 * FT-184 review: what a category correction may teach. A phrase teaches only the words that can name a place or a
 * thing — not how it was paid, how much, when, a legal form or a city; a payment teaches its whole merchant.
 */
describe('the words a phrase correction teaches (FT-184)', () => {
  it.each([
    ['zzqx 50000', ['zzqx']],
    ['кофе картой 25к в korzinka market', ['кофе', 'korzinka']],
    ['вчера двадцать тысяч за zzqx наличными', ['zzqx']],
    ['ooo texnomart tashkent', ['texnomart']],
    ['KKWQ PAYNET UZCARD', ['kkwq']],
    ['yigirma ming zzqx naqd', ['zzqx']],
    ['купил продукты, zzqx и ещё zzqx!', ['продукты', 'zzqx']],
    ['ёлочные игрушки', ['елочные', 'игрушки']],
    ['zzqx восьмое марта', ['zzqx']],
    ['zzqx 8 марта, третьего января и двадцать первого', ['zzqx']],
    ['zzqx sakkizinchi mart, oktyabr', ['zzqx']],
    ['пятёрочка 30000', ['пятерочка']],
    // Uzbek legal forms (FT-208): yakka tartibdagi tadbirkor and davlat unitar korxonasi, in Latin and Cyrillic
    ['ytt zzqx 25000', ['zzqx']],
    ['Ytt Abduvoxidov Davronbek', ['abduvoxidov', 'davronbek']],
    ['YaTT zzqx', ['zzqx']],
    ['ЯТТ zzqx', ['zzqx']],
    ['DUK zzqx', ['zzqx']],
    ['ДУК zzqx', ['zzqx']],
  ])('«%s» teaches %j', (phrase, words) => {
    expect(lessonWordsOf(phrase, [])).toEqual(words);
  });

  it('never the words of the user’s account names: «Капитал», «Black» of «Humo Black»', () => {
    expect(lessonWordsOf('zzqx капитал black 30000', ['Humo Black', 'Капитал'])).toEqual(['zzqx']);
  });

  it('«сто» is a number: «СТО» of a car service is not taught (accepted, FT-184)', () => {
    expect(lessonWordsOf('сто 300000', [])).toEqual([]);
  });

  it('nothing for a phrase of numbers and service words', () => {
    expect(lessonWordsOf('7777 paynet tashkent 50000', [])).toEqual([]);
  });
});

describe('the merchant a payment correction teaches (FT-184)', () => {
  it.each([
    ['ZZQX 77', 'zzqx'],
    ['ZZQX 78', 'zzqx'],
    ['KKWQ PAYNET UZCARD', 'kkwq paynet uzcard'],
    ['  EVOS  Chilonzor ', 'evos chilonzor'],
    ['Ёлка-2', 'елка'],
    ['7777', ''],
    // Without its legal form (FT-208): «YTT X», «ЯТТ X» and «X» are one merchant
    ['Ytt Abduvoxidov Davronbek', 'abduvoxidov davronbek'],
    ['ЯТТ Abduvoxidov Davronbek', 'abduvoxidov davronbek'],
    ['Ooo Mazzali Super Food', 'mazzali super food'],
    ['ООО 777', ''],
  ])('«%s» is «%s»', (merchant, key) => {
    expect(merchantKey(merchant)).toBe(key);
  });
});
