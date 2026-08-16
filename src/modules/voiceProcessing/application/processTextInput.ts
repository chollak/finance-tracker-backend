import { ProcessedTransaction, DetectedTransaction, DetectedDebt } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { DebtType } from '../../debt/domain/debtEntity';
import { DebtLimitExceededError } from '../../debt/domain/errors';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { normalizeCategory } from '../../../shared/domain/entities/Category';
import { normalizeSemanticType, TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';
import { AnalysisResult, ParsedTransaction } from '../domain/transcriptionService';

const logger = getLogger(LogCategory.OPENAI);

// \b relies on \w, which only covers ASCII — it silently fails to bound Cyrillic words
// (e.g. "\bперевел\b" never matches). Build boundaries from Unicode letter/number classes instead.
function conservativeKeywordPattern(alternatives: string[], flags = 'iu'): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, flags);
}

const DEBT_KEYWORDS_PATTERN = /\b(lent|borrowed|owe|debt|loan)\b|долг|должен|одолжил|одолжила|занял|заняла|қарз|qarz/i;
const COMPLEX_TEXT_MARKERS_PATTERN = /[.!?;]/;
const COMPLEX_TEXT_WORDS_PATTERN = conservativeKeywordPattern([
  'и', 'and', 'за', 'по', 'купил\\p{L}*', 'взял\\p{L}*', 'всех', 'компани\\p{L}*', 'поровну', 'скинул\\p{L}*', 'split',
]);
const CURRENCY_WORDS_PATTERN = conservativeKeywordPattern(['сум', 'sum', 'uzs'], 'giu');

const AMOUNT_TOKEN_PATTERN = /[+-]?\d[\d\s.,]*/g;

// Magnitude words directly after an amount: "12 млн", "25 тыс", "15к". A bare "к"/"k" only counts
// when glued to the digits, so the preposition ("500000 к маме") and units ("4кг") stay untouched.
const MAGNITUDE_SUFFIX_SOURCE =
  "(?:\\s?(?:млрд|миллиард\\p{L}*|mlrd|млн|миллион\\p{L}*|mln|тысяч\\p{L}*|тыщ\\p{L}*|тыс|ming)|[кk])(?![\\p{L}\\p{N}_])";
const MAGNITUDE_SUFFIX_PATTERN = new RegExp(`^${MAGNITUDE_SUFFIX_SOURCE}`, 'iu');
// A decimal point inside a magnitude amount ("3.5 млн") is not sentence punctuation.
const MAGNITUDE_DECIMAL_POINT_PATTERN = new RegExp(`(\\d)\\.(\\d+${MAGNITUDE_SUFFIX_SOURCE})`, 'giu');

const MAGNITUDE_FACTORS: Array<[RegExp, number]> = [
  [/^(?:млрд|миллиард|mlrd)/iu, 1_000_000_000],
  [/^(?:млн|миллион|mln)/iu, 1_000_000],
  [/^(?:тыс|тыщ|ming|к|k)/iu, 1_000],
];

function magnitudeFactor(suffix: string): number {
  const word = suffix.trim().toLowerCase();
  if (!word) {
    return 1;
  }

  const factor = MAGNITUDE_FACTORS.find(([pattern]) => pattern.test(word));
  return factor ? factor[1] : 1;
}

interface ParsedAmount {
  amount: number;
  textBefore: string;
  textAfter: string;
}

/**
 * Reads the single amount of a phrase together with its magnitude word, and reports the text
 * left on either side of it so callers never keep "млн" in a description or merchant.
 * Returns null when the phrase does not hold exactly one usable amount.
 */
function parseSingleAmount(normalizedText: string): ParsedAmount | null {
  const matches = [...normalizedText.matchAll(AMOUNT_TOKEN_PATTERN)];
  if (matches.length !== 1) {
    return null;
  }

  const match = matches[0];
  const start = match.index ?? 0;
  // Separators swallowed at the end of the loose token belong to the text, not to the number.
  const token = match[0].replace(/[\s.,]+$/, '');
  const tokenEnd = start + token.length;

  const suffix = MAGNITUDE_SUFFIX_PATTERN.exec(normalizedText.slice(tokenEnd))?.[0] ?? '';
  // "1,5 млн" reads as either 1.5 or 15 million; hand such phrases to OpenAI rather than pick one.
  if (suffix && token.includes(',')) {
    return null;
  }

  const amount = Number(token.replace(/[\s,]/g, '')) * magnitudeFactor(suffix);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return {
    amount,
    textBefore: normalizedText.slice(0, start),
    textAfter: normalizedText.slice(tokenEnd + suffix.length),
  };
}

function isComplexText(normalizedText: string): boolean {
  return COMPLEX_TEXT_MARKERS_PATTERN.test(normalizedText.replace(MAGNITUDE_DECIMAL_POINT_PATTERN, '$1$2'))
    || COMPLEX_TEXT_WORDS_PATTERN.test(normalizedText)
    || DEBT_KEYWORDS_PATTERN.test(normalizedText);
}

const SAVING_DEPOSIT_KEYWORDS_PATTERN = conservativeKeywordPattern([
  'вклад\\p{L}*', 'накоплени\\p{L}*', 'сбережени\\p{L}*', "jamg'?or\\p{L}*",
]);
const CASH_WITHDRAWAL_VERB_PATTERN = conservativeKeywordPattern(['снял\\p{L}*', 'yechib oldim', 'yechdim']);
const CASH_WITHDRAWAL_STANDALONE_PATTERN = conservativeKeywordPattern(['обналичил\\p{L}*']);
const CASH_INDICATOR_PATTERN = conservativeKeywordPattern(['налич\\p{L}*', 'нал', 'cash', 'nakd', 'naqd']);
// Where the cash came from. "снял в банкомате 300000" names no cash word at all, so without these
// the phrase used to fall through to the simple parser and become a real expense.
const CASH_SOURCE_PATTERN = conservativeKeywordPattern(['банкомат\\p{L}*', 'bankomat\\p{L}*', 'atm', 'kart\\p{L}*']);
const TRANSFER_VERB_PATTERN = conservativeKeywordPattern([
  'перевел\\p{L}*', 'перевёл\\p{L}*', 'перекинул\\p{L}*', 'kochirdim', "o'?tkazdim", 'otkazdim', 'transferred',
]);
const OWN_ACCOUNT_TARGET_PATTERN = conservativeKeywordPattern([
  'себе', 'карт\\p{L}*', 'счет\\p{L}*', 'счёт\\p{L}*', 'alif', 'payme', 'click', 'uzcard', 'humo',
]);
const INCOME_KEYWORDS_PATTERN = conservativeKeywordPattern(['зарплат\\p{L}*', 'зп', 'аванс', 'оклад', 'salary', 'maosh']);

/**
 * A withdrawal is obvious only when the phrase says both that money was taken out and where from
 * (cash, an ATM, a card or an own account). A bare "снял 300000" stays ambiguous — it may be rent
 * ("снял квартиру") — and is left to OpenAI rather than guessed.
 */
function isObviousCashWithdrawal(text: string): boolean {
  return CASH_WITHDRAWAL_STANDALONE_PATTERN.test(text)
    || (
      CASH_WITHDRAWAL_VERB_PATTERN.test(text)
      && (
        CASH_INDICATOR_PATTERN.test(text)
        || CASH_SOURCE_PATTERN.test(text)
        || OWN_ACCOUNT_TARGET_PATTERN.test(text)
      )
    );
}

function mentionsCashWithdrawal(text: string): boolean {
  return CASH_WITHDRAWAL_VERB_PATTERN.test(text) || CASH_WITHDRAWAL_STANDALONE_PATTERN.test(text);
}

/**
 * Conservative fast path for obvious single-amount phrases whose semantic meaning
 * (transfer/savings/cash withdrawal/income) is unambiguous, so OpenAI is only used
 * for genuinely ambiguous or multi-item text.
 */
function parseObviousSemanticTransaction(text: string): AnalysisResult | null {
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  if (isComplexText(normalizedText)) {
    return null;
  }

  const parsedAmount = parseSingleAmount(normalizedText);
  if (!parsedAmount) {
    return null;
  }

  const { amount } = parsedAmount;
  const trailingAfterAmount = parsedAmount.textAfter.replace(CURRENCY_WORDS_PATTERN, ' ').trim();
  const leadingBeforeAmount = parsedAmount.textBefore.trim();

  // For one-sided semantic fast paths like income/savings, words after the amount are often
  // unrecognized magnitude slang (e.g. "зарплата 12 лямов"). Do not save the bare number
  // with confidence=1; ask OpenAI instead. Own-transfer phrases are excluded because
  // "перевел 500000 на Alif" legitimately carries the target after the amount.
  if (
    trailingAfterAmount
    && (
      INCOME_KEYWORDS_PATTERN.test(leadingBeforeAmount)
      || SAVING_DEPOSIT_KEYWORDS_PATTERN.test(leadingBeforeAmount)
      || isObviousCashWithdrawal(leadingBeforeAmount)
    )
  ) {
    return null;
  }

  const remainder = `${parsedAmount.textBefore} ${parsedAmount.textAfter}`
    .replace(CURRENCY_WORDS_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!remainder) {
    return null;
  }

  let type: 'income' | 'expense' = 'expense';
  let semanticType: TransactionSemanticType | null = null;
  let category = 'other';

  if (SAVING_DEPOSIT_KEYWORDS_PATTERN.test(remainder)) {
    semanticType = 'saving_deposit';
    category = 'transfer';
  } else if (isObviousCashWithdrawal(remainder)) {
    semanticType = 'cash_withdrawal';
    category = 'transfer';
  } else if (TRANSFER_VERB_PATTERN.test(remainder) && OWN_ACCOUNT_TARGET_PATTERN.test(remainder)) {
    semanticType = 'own_transfer';
    category = 'transfer';
  } else if (INCOME_KEYWORDS_PATTERN.test(remainder)) {
    type = 'income';
    semanticType = 'income';
    category = normalizeCategory(remainder);
  }

  if (!semanticType) {
    return null;
  }

  const transaction: ParsedTransaction = {
    intent: 'transaction',
    amount,
    category,
    type,
    semanticType,
    needsReview: false,
    date: new Date().toISOString().split('T')[0],
    merchant: remainder,
    confidence: 1,
    description: remainder,
  };

  return { transactions: [transaction], debts: [] };
}

function parseSimpleTextTransaction(text: string): AnalysisResult | null {
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  if (isComplexText(normalizedText)) {
    return null;
  }

  const parsedAmount = parseSingleAmount(normalizedText);
  if (!parsedAmount) {
    return null;
  }

  // The simple form is "<label> <amount>[ currency]": only a currency word may follow the amount.
  const { amount } = parsedAmount;
  const label = parsedAmount.textBefore.trim();
  const trailing = parsedAmount.textAfter.replace(CURRENCY_WORDS_PATTERN, ' ').trim();

  if (!label || trailing || !/\s$/.test(parsedAmount.textBefore)) {
    return null;
  }

  // Withdrawal wording that the semantic parser did not find obvious ("снял 300000") is ambiguous,
  // not a plain expense: hand it to OpenAI instead of silently inflating real spending.
  if (mentionsCashWithdrawal(normalizedText)) {
    return null;
  }

  const transaction: ParsedTransaction = {
    intent: 'transaction',
    amount,
    category: normalizeCategory(label),
    type: 'expense',
    semanticType: 'expense',
    needsReview: false,
    date: new Date().toISOString().split('T')[0],
    merchant: label,
    confidence: 1,
    description: label,
  };

  return { transactions: [transaction], debts: [] };
}

export class ProcessTextInputUseCase {
  constructor(
    private openAIService: TranscriptionService,
    private createTransactionUseCase: CreateTransactionUseCase,
    private createDebtUseCase?: CreateDebtUseCase
  ) {}

  async execute(text: string, userId: string, userName?: string): Promise<ProcessedTransaction> {
    const parsed = parseObviousSemanticTransaction(text)
      || parseSimpleTextTransaction(text)
      // Fall back to OpenAI for complex/natural-language inputs and debts.
      || await this.openAIService.analyzeInput(text);

    const transactionResults: DetectedTransaction[] = [];
    const debtResults: DetectedDebt[] = [];

    // Process transactions
    for (const p of parsed.transactions) {
      try {
        const type = p.type || 'expense';
        const semanticType = normalizeSemanticType(p.semanticType, type);
        const needsReview = p.needsReview === true;
        const transaction: Transaction = {
          date: p.date || new Date().toISOString().split('T')[0],
          category: p.category || 'other',
          description: p.description || text,
          amount: p.amount || 0,
          type,
          semanticType,
          needsReview,
          userId,
          userName,
          merchant: p.merchant,
          confidence: p.confidence,
          originalText: text,
          originalParsing: {
            amount: p.amount || 0,
            category: p.category || 'other',
            type,
            semanticType,
            needsReview,
            merchant: p.merchant,
            confidence: p.confidence,
          },
        };

        const createResult = await this.createTransactionUseCase.execute(transaction);
        if (createResult.success) {
          transactionResults.push({
            id: createResult.data,
            amount: transaction.amount,
            category: transaction.category,
            type: transaction.type,
            semanticType: transaction.semanticType,
            needsReview: transaction.needsReview,
            date: transaction.date,
            merchant: transaction.merchant,
            confidence: transaction.confidence,
            description: transaction.description,
          });
        } else {
          logger.error('Failed to create transaction', null, { error: createResult.error?.message });
        }
      } catch (error) {
        logger.error('Failed to create transaction from text input', error as Error, {
          transactionData: p,
          userId,
        });
      }
    }

    // Process debts (if DebtModule is available)
    if (this.createDebtUseCase && parsed.debts.length > 0) {
      for (const d of parsed.debts) {
        try {
          const debtType = d.debtType === 'i_owe' ? DebtType.I_OWE : DebtType.OWED_TO_ME;

          const result = await this.createDebtUseCase.execute({
            userId,
            type: debtType,
            personName: d.personName,
            amount: d.amount,
            description: d.description || text,
            dueDate: d.dueDate || undefined,
            moneyTransferred: d.moneyTransferred,
          });

          // Check if result was successful
          if (result.success) {
            debtResults.push({
              id: result.data.id!,
              debtType: d.debtType,
              personName: d.personName,
              amount: d.amount,
              dueDate: d.dueDate,
              description: d.description,
              confidence: d.confidence,
              // Only report a real linked transaction id when the debt result provides one.
              linkedTransactionId: result.data.relatedTransactionId,
            });
          } else {
            // Re-throw DebtLimitExceededError to show user-friendly message
            if (result.error instanceof DebtLimitExceededError) {
              throw result.error;
            }
            logger.error('Failed to create debt', null, { error: result.error.message });
          }
        } catch (error) {
          // Re-throw DebtLimitExceededError to show user-friendly message
          if (error instanceof DebtLimitExceededError) {
            throw error;
          }
          logger.error('Failed to create debt from text input', error as Error, {
            debtData: d,
            userId,
          });
        }
      }
    }

    return { text, transactions: transactionResults, debts: debtResults };
  }
}
