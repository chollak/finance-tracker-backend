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
import {
  conservativeKeywordPattern,
  DEBT_KEYWORDS_PATTERN,
  REPAYMENT_KEYWORDS_PATTERN,
  SAVING_DEPOSIT_KEYWORDS_PATTERN,
  INCOME_KEYWORDS_PATTERN,
  isObviousCashWithdrawal,
  isObviousOwnTransfer,
  mentionsCashWithdrawal,
} from '../../../shared/domain/semantics/semanticKeywords';

const logger = getLogger(LogCategory.OPENAI);

const COMPLEX_TEXT_MARKERS_PATTERN = /[.!?;]/;
const COMPLEX_TEXT_WORDS_PATTERN = conservativeKeywordPattern([
  'и', 'and', 'за', 'по', 'купил\\p{L}*', 'взял\\p{L}*', 'всех', 'компани\\p{L}*', 'поровну', 'скинул\\p{L}*', 'split',
]);
const CURRENCY_WORD_ALTERNATIVES = ['сум', 'sum', 'uzs'];
const CURRENCY_WORDS_PATTERN = conservativeKeywordPattern(CURRENCY_WORD_ALTERNATIVES, 'giu');
// The same currency words, but only where they directly follow an amount ("1234 сум"),
// which is what makes that number the one the user marked as money.
const CURRENCY_UNIT_AFTER_AMOUNT_PATTERN = new RegExp(
  `^\\s?(?:${CURRENCY_WORD_ALTERNATIVES.join('|')})(?![\\p{L}\\p{N}_])`,
  'iu'
);

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

interface TextAmount {
  value: number;
  currencyMarked: boolean;
}

/**
 * Every number the phrase actually spells out, each tagged with whether a currency word follows it.
 * Unlike parseSingleAmount this never gives up on multi-number text — it is used to check an
 * already-parsed amount against the text, not to pick one.
 */
function readTextAmounts(text: string): TextAmount[] {
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  return [...normalizedText.matchAll(AMOUNT_TOKEN_PATTERN)].flatMap(match => {
    const start = match.index ?? 0;
    const token = match[0].replace(/[\s.,]+$/, '');
    const afterToken = normalizedText.slice(start + token.length);
    const suffix = MAGNITUDE_SUFFIX_PATTERN.exec(afterToken)?.[0] ?? '';

    const value = Number(token.replace(/[\s,]/g, '')) * magnitudeFactor(suffix);
    if (!Number.isFinite(value) || value <= 0) {
      return [];
    }

    return [{
      value,
      currencyMarked: CURRENCY_UNIT_AFTER_AMOUNT_PATTERN.test(afterToken.slice(suffix.length)),
    }];
  });
}

/**
 * OpenAI sometimes reads a bare trailing number — an order id, a note, a phone number — as the
 * amount even though the phrase marks a different number with a currency word
 * ("кофе 1234 сум 1788405366" saved as 1 788 405 366). Only that exact misread is corrected: the
 * chosen amount has to be another number literally written in the same text, so a computed total
 * ("2 билета по 50000 сум" → 100000) is left untouched. When the text marks a single amount the
 * transaction is pulled back onto it; with several marked amounts nothing is guessed. Either way
 * the capture is flagged for review, because the parse demonstrably picked the wrong number.
 */
function reconcileAmountWithCurrencyMarkedText(
  transaction: ParsedTransaction,
  text: string
): ParsedTransaction {
  const amounts = readTextAmounts(text);
  const markedAmounts = [...new Set(amounts.filter(amount => amount.currencyMarked).map(amount => amount.value))];

  if (markedAmounts.length === 0 || markedAmounts.includes(transaction.amount)) {
    return transaction;
  }

  const isUnmarkedNumberFromText = amounts.some(
    amount => !amount.currencyMarked && amount.value === transaction.amount
  );
  if (!isUnmarkedNumberFromText) {
    return transaction;
  }

  logger.warn('Parsed amount ignored a currency-marked number in the same text', {
    markedAmounts: markedAmounts.length,
    corrected: markedAmounts.length === 1,
  });

  return {
    ...transaction,
    amount: markedAmounts.length === 1 ? markedAmounts[0] : transaction.amount,
    needsReview: true,
  };
}

function isComplexText(normalizedText: string): boolean {
  return COMPLEX_TEXT_MARKERS_PATTERN.test(normalizedText.replace(MAGNITUDE_DECIMAL_POINT_PATTERN, '$1$2'))
    || COMPLEX_TEXT_WORDS_PATTERN.test(normalizedText)
    || DEBT_KEYWORDS_PATTERN.test(normalizedText)
    // "мне вернули 100000" reads to the simple parser as the label "мне вернули" plus an amount,
    // so without this it silently became a real expense. Returned money is never a fast path.
    || REPAYMENT_KEYWORDS_PATTERN.test(normalizedText);
}

/**
 * Money that is handed back is a repayment, refund or reimbursement — not consumption. When the
 * parse still comes back as an ordinary expense/income, that ordinary label is the part the text
 * contradicts, so the capture is flagged for review rather than silently counted as real spending
 * or real income. A parse that already named a non-ordinary meaning (debt, reimbursement,
 * own_transfer, …) is trusted and left untouched.
 */
function flagRepaymentWording(transaction: ParsedTransaction, text: string): ParsedTransaction {
  if (transaction.needsReview === true || !REPAYMENT_KEYWORDS_PATTERN.test(text)) {
    return transaction;
  }

  const semanticType = normalizeSemanticType(transaction.semanticType, transaction.type || 'expense');
  if (semanticType !== 'expense' && semanticType !== 'income') {
    return transaction;
  }

  logger.warn('Returned-money wording parsed as an ordinary transaction', { semanticType });

  return { ...transaction, needsReview: true };
}

const LENDING_VERB_PATTERN = conservativeKeywordPattern([
  'одолжил', 'одолжила', 'дал в долг', 'дала в долг', 'даю в долг', 'lent',
]);
// "у <кого>" names where the money came from and "мне" names who received it; either one means the
// user was the borrower, whatever verb the phrase uses.
const BORROWING_MARKER_PATTERN = conservativeKeywordPattern(['у', 'мне']);

/**
 * "одолжил Азизу 300000" was being stored as `i_owe`, i.e. with the debt pointing the wrong way.
 * Only that misread is corrected: a lending verb with no borrowing marker can only mean the user
 * gave the money away. Phrases that do name a source or a receiver ("занял 200000 у Алишера",
 * "мне одолжил Азиз") no longer pin the direction on wording alone and are left to the parser.
 */
function isUnambiguousLendingPhrase(text: string): boolean {
  return LENDING_VERB_PATTERN.test(text) && !BORROWING_MARKER_PATTERN.test(text);
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
  } else if (isObviousOwnTransfer(remainder)) {
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

    // Only a single-transaction parse is checked against the text's currency markers. In
    // multi-item text ("продукты 12000 сум и такси 30000") each number belongs to its own
    // transaction, so an unmarked amount there is expected rather than a misread.
    const reconciled = parsed.transactions.length === 1 && parsed.debts.length === 0
      ? [reconcileAmountWithCurrencyMarkedText(parsed.transactions[0], text)]
      : parsed.transactions;
    // Repayment wording, on the other hand, casts doubt on the whole capture: which item of a
    // multi-item text the returned money belongs to is exactly what is unclear, so each one is
    // flagged rather than guessed at.
    const transactions = reconciled.map(transaction => flagRepaymentWording(transaction, text));

    // Debt direction is read back from the text only where the wording leaves no room for doubt,
    // and only for a single-debt parse, so a multi-debt text keeps each debt's own direction.
    const debts = parsed.debts.length === 1 && isUnambiguousLendingPhrase(text)
      ? [{ ...parsed.debts[0], debtType: 'owed_to_me' as const }]
      : parsed.debts;

    const transactionResults: DetectedTransaction[] = [];
    const debtResults: DetectedDebt[] = [];

    // Process transactions
    for (const p of transactions) {
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
    if (this.createDebtUseCase && debts.length > 0) {
      for (const d of debts) {
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
