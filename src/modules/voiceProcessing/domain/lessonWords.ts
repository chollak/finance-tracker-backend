import { stripPaymentWords } from './paymentHints';
import { namesNothing, wordsOf } from './categoryGuess';

/**
 * What a category correction may teach (FT-184, review of 2026-10-30). A correction used to teach every word of its
 * text, so «KKWQ PAYNET UZCARD» corrected once into «Кафе» sent every later «PAYNET …» payment there without a «?».
 * A phrase now teaches only the words that can name a place or a thing; a payment teaches its whole merchant.
 */

/** Legal forms, shop words, payment services and places: on a receipt or in a phrase they name no category. */
const SERVICE_WORDS = new Set([
  'ooo', 'ооо', 'llc', 'ltd', 'inc', 'mchj', 'мчж', 'chp', 'чп', 'оао', 'зао', 'плс', 'plc',
  'market', 'маркет', 'shop', 'store', 'mall', 'city', 'center', 'centre', 'центр', 'filial', 'филиал', 'branch',
  'paynet', 'пайнет', 'click', 'клик', 'payme', 'пейми', 'apelsin', 'oson', 'upay', 'pay', 'apple', 'google',
  'tashkent', 'toshkent', 'ташкент', 'тошкент', 'samarkand', 'samarqand', 'самарканд', 'bukhara', 'buxoro', 'бухара',
  'andijan', 'andijon', 'андижан', 'namangan', 'наманган', 'fergana', 'fargona', 'фергана', 'nukus', 'нукус',
  'navoi', 'navoiy', 'навои', 'karshi', 'qarshi', 'карши', 'termez', 'termiz', 'термез', 'urgench', 'urganch', 'ургенч',
  'jizzakh', 'jizzax', 'джизак', 'gulistan', 'guliston', 'гулистан', 'uzbekistan', 'ozbekiston', 'узбекистан',
]);

/**
 * How much in words, in Russian, Uzbek and English. «o‘ttiz», «to‘qqiz», «to‘qson» split at the apostrophe; their
 * tails are here, the heads are too short to teach anyway.
 */
const NUMBER_WORDS = new Set([
  'один', 'одна', 'одну', 'два', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять',
  'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать',
  'восемнадцать', 'девятнадцать', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят',
  'восемьдесят', 'девяносто', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот',
  'девятьсот', 'тысяча', 'тысячи', 'тысяч', 'тыщ', 'тыщи', 'полтора', 'полторы', 'половина', 'миллиона', 'миллионов',
  'миллиард', 'млрд',
  'bir', 'ikki', 'uch', 'tort', 'turt', 'besh', 'olti', 'yetti', 'sakkiz', 'toqqiz', 'qqiz', 'yigirma', 'ottiz',
  'ttiz', 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', 'toqson', 'qson', 'yuz', 'ming', 'million', 'mln',
  'one', 'two', 'three', 'five', 'ten', 'hundred', 'thousand',
]);

/**
 * When, beyond «вчера» and «сегодня» of the generic words: weekdays, other days and months, in Russian, Uzbek and
 * English.
 */
const DAY_WORDS = new Set([
  'понедельник', 'вторник', 'среда', 'среду', 'четверг', 'пятница', 'пятницу', 'суббота', 'субботу', 'воскресенье',
  'неделе', 'неделю', 'прошлой', 'прошлый', 'послезавтра', 'назад',
  'bugun', 'kecha', 'ertaga', 'бугун', 'кеча', 'today', 'yesterday', 'tomorrow',
  'январь', 'января', 'январе', 'февраль', 'февраля', 'феврале', 'март', 'марта', 'марте', 'апрель', 'апреля',
  'апреле', 'май', 'мая', 'мае', 'июнь', 'июня', 'июне', 'июль', 'июля', 'июле', 'август', 'августа', 'августе',
  'сентябрь', 'сентября', 'сентябре', 'октябрь', 'октября', 'октябре', 'ноябрь', 'ноября', 'ноябре', 'декабрь',
  'декабря', 'декабре',
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'sentyabr', 'oktabr', 'oktyabr',
  'noyabr', 'dekabr',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
]);

/**
 * A day of the month in words: Russian ordinals up to «тридцатое» in any ending («восьмое», «третьего», «первого»), and
 * Uzbek ones («sakkizinchi»; «to‘rtinchi» splits to «rtinchi»).
 */
const ORDINAL_PATTERN = new RegExp(
  '^(?:(?:перв|втор|четверт|пят|шест|седьм|восьм|девят|десят'
  + '|(?:одиннадц|двенадц|тринадц|четырнадц|пятнадц|шестнадц|семнадц|восемнадц|девятнадц|двадц|тридц)ат)'
  + '(?:ый|ой|ая|ое|ого|ому|ом|ую|ые|ых)'
  + '|трет(?:ий|ья|ье|ьего|ьему|ьем|ью|ьи|ьих)'
  + '|\\p{L}+nchi)$',
  'u'
);

/**
 * The words a correction of a phrase teaches: those longer than two letters that are not a way to pay («картой»,
 * «uzcard», `stripPaymentWords`), not generic («купил», «деньги»), not an amount or a number word, not a day, month or
 * day of the month, not a legal form, shop word or city, and not a word of the user's account names. Each once. «сто»
 * is a number, so «СТО» of a car service is not taught.
 */
export function lessonWordsOf(phrase: string, accountNames: readonly string[]): string[] {
  const accountWords = new Set(accountNames.flatMap(wordsOf));
  const words = wordsOf(stripPaymentWords(phrase)).filter(word =>
    !namesNothing(word)
    && !SERVICE_WORDS.has(word)
    && !NUMBER_WORDS.has(word)
    && !DAY_WORDS.has(word)
    && !ORDINAL_PATTERN.test(word)
    && !accountWords.has(word));
  return [...new Set(words)];
}

/**
 * The merchant a payment correction teaches, as it is looked up: its words folded, without the ones with digits — so
 * «ZZQX 77» and «ZZQX 78» are one merchant, «KKWQ PAYNET UZCARD» and «PAYNET MOBILE» two. Empty for «7777».
 */
export function merchantKey(merchant: string): string {
  return wordsOf(merchant).filter(word => !/\p{N}/u.test(word)).join(' ');
}
