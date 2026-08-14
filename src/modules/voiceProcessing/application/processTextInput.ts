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
import { parseAmount } from './parseAmount';

const logger = getLogger(LogCategory.OPENAI);


// \b relies on \w, which only covers ASCII — it silently fails to bound Cyrillic words
// (e.g. "\bперевел\b" never matches). Build boundaries from Unicode letter/number classes instead.
function conservativeKeywordPattern(alternatives: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'iu');
}

const DEBT_KEYWORDS_PATTERN = /\b(lent|borrowed|owe|debt|loan)\b|долг|должен|одолжил|одолжила|занял|заняла|қарз|qarz/i;
const COMPLEX_TEXT_MARKERS_PATTERN = /[.!?;]/;
const COMPLEX_TEXT_WORDS_PATTERN = conservativeKeywordPattern([
  'и', 'and', 'за', 'по', 'купил\\p{L}*', 'взял\\p{L}*', 'всех', 'компани\\p{L}*', 'поровну', 'скинул\\p{L}*', 'split',
]);

const SAVING_DEPOSIT_KEYWORDS_PATTERN = conservativeKeywordPattern([
  'вклад\\p{L}*', 'накоплени\\p{L}*', 'сбережени\\p{L}*', "jamg'?or\\p{L}*",
]);
const CASH_WITHDRAWAL_VERB_PATTERN = conservativeKeywordPattern(['снял\\p{L}*', 'yechib oldim', 'yechdim']);
const CASH_WITHDRAWAL_STANDALONE_PATTERN = conservativeKeywordPattern(['обналичил\\p{L}*']);
const CASH_INDICATOR_PATTERN = conservativeKeywordPattern(['налич\\p{L}*', 'нал', 'cash', 'nakd']);
const TRANSFER_VERB_PATTERN = conservativeKeywordPattern([
  'перевел\\p{L}*', 'перевёл\\p{L}*', 'перекинул\\p{L}*', 'kochirdim', "o'?tkazdim", 'otkazdim', 'transferred',
]);
const OWN_ACCOUNT_TARGET_PATTERN = conservativeKeywordPattern([
  'себе', 'карт\\p{L}*', 'счет', 'счёт', 'alif', 'payme', 'click', 'uzcard', 'humo',
]);
const INCOME_KEYWORDS_PATTERN = conservativeKeywordPattern(['зарплат\\p{L}*', 'зп', 'аванс', 'оклад', 'salary', 'maosh']);

/**
 * Conservative fast path for obvious single-amount phrases whose semantic meaning
 * (transfer/savings/cash withdrawal/income) is unambiguous, so OpenAI is only used
 * for genuinely ambiguous or multi-item text.
 */
function parseObviousSemanticTransaction(text: string): AnalysisResult | null {
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  if (
    COMPLEX_TEXT_MARKERS_PATTERN.test(normalizedText)
    || COMPLEX_TEXT_WORDS_PATTERN.test(normalizedText)
    || DEBT_KEYWORDS_PATTERN.test(normalizedText)
  ) {
    return null;
  }

  // parseAmount declines rather than guessing when something is attached to
  // the number, so a magnitude word can no longer be dropped in silence.
  const parsedAmount = parseAmount(normalizedText);
  if (!parsedAmount) {
    return null;
  }

  const { amount } = parsedAmount;
  const remainder = parsedAmount.remainder;

  let type: 'income' | 'expense' = 'expense';
  let semanticType: TransactionSemanticType | null = null;
  let category = 'other';

  if (SAVING_DEPOSIT_KEYWORDS_PATTERN.test(remainder)) {
    semanticType = 'saving_deposit';
    category = 'transfer';
  } else if (
    CASH_WITHDRAWAL_STANDALONE_PATTERN.test(remainder)
    || (CASH_WITHDRAWAL_VERB_PATTERN.test(remainder) && CASH_INDICATOR_PATTERN.test(remainder))
  ) {
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

  if (
    COMPLEX_TEXT_MARKERS_PATTERN.test(normalizedText)
    || COMPLEX_TEXT_WORDS_PATTERN.test(normalizedText)
    || DEBT_KEYWORDS_PATTERN.test(normalizedText)
  ) {
    return null;
  }

  // Same guard as the semantic path: nothing attached to the number is ignored.
  const parsedAmount = parseAmount(normalizedText);
  if (!parsedAmount) {
    return null;
  }

  const { amount } = parsedAmount;
  const label = parsedAmount.remainder;
  if (!label) {
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
