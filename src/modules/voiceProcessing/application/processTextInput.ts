import { ProcessedTransaction, DetectedTransaction, DetectedDebt } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { Transaction, TransactionSource } from '../../transaction/domain/transactionEntity';
import { DebtType } from '../../debt/domain/debtEntity';
import { DebtLimitExceededError } from '../../debt/domain/errors';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { normalizeCategory } from '../../../shared/domain/entities/Category';
import { normalizeSemanticType } from '../../transaction/domain/transactionSemanticType';
import { AnalysisResult, ParsedTransaction } from '../domain/transcriptionService';
import { parseAmount } from './parseAmount';
import { classifyByText, DEBT_KEYWORDS_PATTERN } from './classifyByText';

const logger = getLogger(LogCategory.OPENAI);


// \b relies on \w, which only covers ASCII — it silently fails to bound Cyrillic words
// (e.g. "\bперевел\b" never matches). Build boundaries from Unicode letter/number classes instead.
function conservativeKeywordPattern(alternatives: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'iu');
}

const COMPLEX_TEXT_MARKERS_PATTERN = /[.!?;]/;
const COMPLEX_TEXT_WORDS_PATTERN = conservativeKeywordPattern([
  'и', 'and', 'за', 'по', 'купил\\p{L}*', 'взял\\p{L}*', 'всех', 'компани\\p{L}*', 'поровну', 'скинул\\p{L}*', 'split',
]);


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

  // One classifier, shared with the backfill preview, so a proposal about an
  // old row is exactly what the parser would produce for the same wording.
  const semanticType = classifyByText(remainder);
  if (!semanticType) {
    return null;
  }

  const type: 'income' | 'expense' = semanticType === 'income' ? 'income' : 'expense';
  const category = semanticType === 'income' ? normalizeCategory(remainder) : 'transfer';

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

/**
 * Почему фраза не прошла быстрым путём и ушла в OpenAI.
 *
 * Только наблюдение: ничего не решает и на разбор не влияет. Нужно, чтобы
 * решение о сужении стоп-слов принималось по данным, а не на глаз — знать долю
 * ухода в сеть мало, надо знать, какой именно гард её создаёт.
 *
 * Гарды перечислены в том же порядке, в каком их проверяют оба быстрых парсера.
 */
export type FastPathBlocker =
  /** Любой из символов .!?; — реагирует и на точку в конце, из-за чего сюда попадают транскрипты Whisper. */
  | 'punctuation'
  /** Стоп-слова COMPLEX_TEXT_WORDS_PATTERN: за, по, и, купил, взял и прочие частые слова. */
  | 'complex-words'
  /** Фраза похожа на долг — быстрый путь их намеренно не разбирает. */
  | 'debt-keywords'
  /** В тексте вообще нет цифр. */
  | 'no-number'
  /** Число есть, но parseAmount отказался: ему нужно ещё и описание рядом ('5000', '200 тысяч'). */
  | 'amount-without-label'
  /** Гарды пройдены и сумма разобрана, но ни один быстрый парсер не собрал транзакцию. */
  | 'not-classified';

export function describeFastPathBlocker(text: string): FastPathBlocker | null {
  const normalizedText = text.trim().replace(/\s+/g, ' ');

  if (COMPLEX_TEXT_MARKERS_PATTERN.test(normalizedText)) return 'punctuation';
  if (COMPLEX_TEXT_WORDS_PATTERN.test(normalizedText)) return 'complex-words';
  if (DEBT_KEYWORDS_PATTERN.test(normalizedText)) return 'debt-keywords';

  const parsedAmount = parseAmount(normalizedText);
  if (!parsedAmount) {
    // Оговорка: суммы прописью ('двести тысяч') попадут в no-number, потому что
    // проверка простая. Для решения о стоп-словах это не мешает — важна доля
    // punctuation и complex-words, а они определяются точно.
    return /\d/.test(normalizedText) ? 'amount-without-label' : 'no-number';
  }

  // Сумма есть и гарды пройдены, но ни семантический, ни простой парсер не собрал
  // транзакцию — например, после числа не осталось текста для категории.
  if (!parseObviousSemanticTransaction(text) && !parseSimpleTextTransaction(text)) {
    return 'not-classified';
  }

  return null;
}

export class ProcessTextInputUseCase {
  constructor(
    private openAIService: TranscriptionService,
    private createTransactionUseCase: CreateTransactionUseCase,
    private createDebtUseCase?: CreateDebtUseCase
  ) {}

  async execute(
    text: string,
    userId: string,
    userName?: string,
    source: TransactionSource = 'telegram'
  ): Promise<ProcessedTransaction> {
    const fastParsed = parseObviousSemanticTransaction(text) || parseSimpleTextTransaction(text);

    // Сырьё для будущего решения о стоп-словах. Само по себе ничего не меняет:
    // доля ухода в сеть плюс причина, по которой быстрый путь оказался закрыт.
    logger.info('Разбор текста', {
      path: fastParsed ? 'fast' : 'openai',
      blocker: fastParsed ? undefined : describeFastPathBlocker(text),
    });

    // Fall back to OpenAI for complex/natural-language inputs and debts.
    const parsed = fastParsed || await this.openAIService.analyzeInput(text);

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
          source,
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
