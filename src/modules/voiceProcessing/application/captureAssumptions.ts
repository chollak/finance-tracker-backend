import { ResolvedAccount } from '../../transaction/domain/accountResolver';
import { CaptureAssumption } from '../domain/processedTransaction';

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

function mentions(text: string, name: string): boolean {
  const fold = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return fold(text).includes(fold(name));
}

/**
 * What the parse assumed about one record (FT-103):
 * - a bare «45» read as 45 000 — the amount is a thousand times a number written without «к»/«тыс»;
 * - a category the text does not name;
 * - the account, and whether a word in the text chose it or it is the default;
 * - dollars on a сум account, because the user has no dollar account (the record awaits review).
 */
export function captureAssumptions(input: {
  text: string;
  amount: number;
  categoryName: string;
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

  if (!mentions(input.text, input.categoryName)) {
    assumptions.push({ kind: 'category', name: input.categoryName });
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
