import { ResolvedAccount } from '../../transaction/domain/accountResolver';
import { CaptureAssumption } from '../domain/processedTransaction';
import { categoryNamedIn, CategoryOfRecord } from '../domain/categoryGuess';

const AMOUNT_TOKEN = /[+-]?\d[\d\s.,]*/g;
const MAGNITUDE_AFTER = /^\s?(?:млрд|миллиард\p{L}*|mlrd|млн|миллион\p{L}*|mln|тысяч\p{L}*|тыщ\p{L}*|тыс|ming|[кk])(?![\p{L}\p{N}_])/iu;

/** The numbers the text spells out as written, without magnitude words («45», but not «45к»). */
function bareNumbers(text: string): string[] {
  return [...text.matchAll(AMOUNT_TOKEN)].flatMap(match => {
    const token = match[0].replace(/[\s.,]+$/, '');
    const after = text.slice((match.index ?? 0) + token.length);
    return MAGNITUDE_AFTER.test(after) ? [] : [token];
  });
}

function asNumber(token: string): number {
  return Number(token.replace(/\s/g, '').replace(',', '.'));
}

/**
 * What the parse assumed about one record (FT-103):
 * - a bare «45» read as 45 000 — the amount is a thousand times a number written without «к»/«тыс»;
 * - a category the AI chose itself (FT-138): not one the record's words name — by its name, a dictionary
 *   word or a learned word — and not one the text paths read from the words without the AI;
 * - the account, and whether a word in the text chose it or it is the default;
 * - dollars on a сум account, because the user has no dollar account (the record awaits review).
 */
export function captureAssumptions(input: {
  text: string;
  amount: number;
  category: CategoryOfRecord & {
    /** `ai` when the parser chose it; `text` when a text path read it from the words. */
    chosenBy: 'ai' | 'text';
    /** The words of this record (`recordWordsOf`). */
    words: string;
    /** What learned patterns tie to its starter category. */
    learnedWords?: readonly string[];
  };
  account?: ResolvedAccount;
  currency: 'UZS' | 'USD';
}): CaptureAssumption[] {
  const assumptions: CaptureAssumption[] = [];

  const numbers = bareNumbers(input.text);
  const writtenAsIs = numbers.some(token => asNumber(token) === input.amount);
  const shortened = numbers.find(token => asNumber(token) * 1000 === input.amount);
  if (!writtenAsIs && shortened) {
    assumptions.push({ kind: 'thousands', written: shortened, amount: input.amount });
  }

  const { category } = input;
  if (category.chosenBy === 'ai' && !categoryNamedIn(category.words, category, category.learnedWords)) {
    assumptions.push({ kind: 'category', name: category.name });
  }

  if (input.account) {
    const reason = input.account.matchedBy === 'default' || input.account.matchedBy === 'picked' ? 'default' : 'hint';
    assumptions.push({ kind: 'account', name: input.account.name, reason });
    if (input.currency === 'USD' && input.account.currency !== 'USD') {
      assumptions.push({ kind: 'currency', currency: 'USD', reason: 'no_usd_account' });
    }
  }
  return assumptions;
}
