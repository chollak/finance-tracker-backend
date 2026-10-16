import { conservativeKeywordPattern } from '../../../shared/domain/semantics/semanticKeywords';

/**
 * What the wording says about where the money was (FT-103, money-model «Что меняется в API»):
 * «нал», «наличными» → cash; «картой», «uzcard», «humo» → card; «$», «долл», «usd» → dollars.
 * Conservative like the semantic keywords: whole words only, so «картошка» is not a card.
 */
export interface PaymentHints {
  currency?: 'USD';
  kind?: 'cash' | 'card';
}

const USD_WORDS = ['долл\\p{L}*', 'usd', 'бакс\\p{L}*', 'dollar\\p{L}*'];
// «кэш», «кэшем», but not «кэшбэк» — that is a category of income, not a way to pay
const CASH_WORDS = ['нал', 'налом', 'наличн\\p{L}*', 'наличк\\p{L}*', 'к[эе]ш(?:а|ем|ом|у)?', 'naqd\\p{L}*', 'nakd\\p{L}*', 'cash'];
const CARD_WORDS = [
  'карт(?:а|ой|е|у|ы|очк\\p{L}*)', 'uzcard', 'узкард\\p{L}*', 'humo', 'хумо', 'card', 'kart(?:a|adan|aga|ada)',
];

const USD_PATTERN = new RegExp(`\\$|${conservativeKeywordPattern(USD_WORDS).source}`, 'iu');
const CASH_PATTERN = conservativeKeywordPattern(CASH_WORDS);
const CARD_PATTERN = conservativeKeywordPattern(CARD_WORDS);

/** Payment words with a preposition in front («по карте», «с карты», «в долларах»), for removal. */
const PAYMENT_WORDS_PATTERN = new RegExp(
  `(?:(?<![\\p{L}\\p{N}_])(?:с|со|по|на|в)\\s+)?(?:${conservativeKeywordPattern([...USD_WORDS, ...CASH_WORDS, ...CARD_WORDS]).source}|\\$)`,
  'giu'
);

export function detectPaymentHints(text: string): PaymentHints {
  const hints: PaymentHints = {};
  if (USD_PATTERN.test(text)) hints.currency = 'USD';
  const cash = CASH_PATTERN.test(text);
  const card = CARD_PATTERN.test(text);
  // Both named — «половину налом, остальное картой» — is for the parser per item, not a single guess
  if (cash !== card) hints.kind = cash ? 'cash' : 'card';
  return hints;
}

/** The text without payment words, so «такси 18000 наличными» parses like «такси 18000». */
export function stripPaymentWords(text: string): string {
  return text.replace(PAYMENT_WORDS_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}
