import { ResolvedAccount } from '../../transaction/domain/accountResolver';
import { CaptureAssumption } from '../domain/processedTransaction';
import { categoryNamedIn, CategoryOfRecord } from '../domain/categoryGuess';
import { readWrittenNumber } from '../domain/writtenNumber';

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
  return readWrittenNumber(token) ?? NaN;
}

/**
 * What the parse assumed about one record (FT-103):
 * - a bare «45» read as 45 000 — the amount is a thousand times a number written without «к»/«тыс»;
 * - a category no word of the record names — by its name, a dictionary word or a learned word (FT-138): the
 *   AI's own choice, or «Другое» for a word a text path did not recognise; never one the record's kind set;
 * - the account, and whether a word in the text chose it or it is the default;
 * - dollars on a сум account, because the user has no dollar account (the record awaits review).
 */
export function captureAssumptions(input: {
  text: string;
  amount: number;
  category: CategoryOfRecord & {
    /**
     * `ai` — the parser chose it; `words` — a text path read it from the label («такси 18000»), so a label
     * the dictionary does not know lands in «Другое» unnamed; `kind` — a fast path set it by the record's kind
     * (a transfer, savings or cash withdrawal goes to «Другое»).
     */
    chosenBy: 'ai' | 'words' | 'kind';
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
  // Rounded as captureMoney rounds it: «1,1» is 1 100, not 1100.0000000000002
  const shortened = numbers.find(token => Math.round(asNumber(token) * 1000) === input.amount);
  if (!writtenAsIs && shortened) {
    assumptions.push({ kind: 'thousands', written: shortened, amount: input.amount });
  }

  const { category } = input;
  if (category.chosenBy !== 'kind' && !categoryNamedIn(category.words, category, category.learnedWords)) {
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
