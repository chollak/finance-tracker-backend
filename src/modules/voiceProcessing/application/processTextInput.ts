import { ProcessedTransaction, DetectedTransaction, ItemWithoutAmount } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { errorFields, getLogger, LogCategory } from '../../../shared/application/logging';
import { AnalysisContext, starterRecordCategories, UserCategorySource } from '../domain/categoryPrompt';
import { detectPaymentHints, stripPaymentWords } from '../domain/paymentHints';
import { RecordSource } from '../../transaction/domain/recordSource';
import { categoryNamedBy, CategoryOfRecord, LearnedCategoryWords } from '../domain/categoryGuess';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { phraseDayOf } from '../domain/phraseDay';
import {
  CURRENCY_WORDS_PATTERN,
  MAGNITUDE_DECIMAL_POINT_PATTERN,
  parseSingleAmount,
  THOUSANDS_POINT_PATTERN,
} from '../domain/textAmounts';
import { TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';
import { AnalysisResult, ParsedTransaction } from '../domain/transcriptionService';
import { ParsedRecordWriter } from './writeParsedRecords';
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

function isComplexText(normalizedText: string): boolean {
  const withoutNumberPoints = normalizedText.replace(MAGNITUDE_DECIMAL_POINT_PATTERN, '$1$2').replace(THOUSANDS_POINT_PATTERN, '');
  return COMPLEX_TEXT_MARKERS_PATTERN.test(withoutNumberPoints)
    || COMPLEX_TEXT_WORDS_PATTERN.test(normalizedText)
    || DEBT_KEYWORDS_PATTERN.test(normalizedText)
    // "мне вернули 100000" reads to the simple parser as the label "мне вернули" plus an amount,
    // so without this it silently became a real expense. Returned money is never a fast path.
    || REPAYMENT_KEYWORDS_PATTERN.test(normalizedText);
}

/**
 * Conservative fast path for obvious single-amount phrases whose semantic meaning
 * (transfer/savings/cash withdrawal/income) is unambiguous, so OpenAI is only used
 * for genuinely ambiguous or multi-item text. The record is of `date`.
 */
function parseObviousSemanticTransaction(text: string, date: string): AnalysisResult | null {
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
    // «зарплата», «аванс» — resolved to the user's income category on create (FT-099)
    category = remainder;
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
    date,
    merchant: remainder,
    confidence: 1,
    description: remainder,
  };

  return { transactions: [transaction], debts: [] };
}

function parseSimpleTextTransaction(text: string, date: string): AnalysisResult | null {
  // «такси 18000 наличными», «наушники 55$» parse like «такси 18000» — the payment words are read
  // separately as account and currency hints (FT-103)
  const normalizedText = stripPaymentWords(text.trim().replace(/\s+/g, ' '));

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
    // The label itself — «такси», «кофе», a renamed category — is resolved to the user's category on create
    category: label,
    type: 'expense',
    semanticType: 'expense',
    needsReview: false,
    date,
    merchant: label,
    confidence: 1,
    description: label,
  };

  return { transactions: [transaction], debts: [] };
}

/** The answer to «Сколько?» (FT-123): what the person wrote and the amount read from it. */
export interface AmountAnswer {
  /** As written: «18к нал», «45», «60$». */
  text: string;
  /** In the answer's currency, major units, «45» already read as 45 000. */
  amount: number;
  currency: 'UZS' | 'USD';
  /** «нал», «картой» in the answer. */
  kind?: 'cash' | 'card';
}

export interface TextInputOptions {
  /** Where the text came from; recorded on every record (FT-103). */
  source?: RecordSource;
  /** The client's id for the capture (FT-106); its records get «<id>», «<id>:1», … */
  clientId?: string;
  /**
   * The day the phrase was said, YYYY-MM-DD on the user's calendar (FT-175): a phrase from the phone's queue is dated
   * by the day it was typed, not the day it arrived. Today when absent.
   */
  today?: string;
}

/** The user's categories for the parser prompt; the starter set if they cannot be read. */
export async function analysisContextFor(source: UserCategorySource | undefined, userId: string): Promise<AnalysisContext> {
  if (!source) return {};
  try {
    const [categories, presetNames] = await Promise.all([source.promptCategories(userId), source.presetNames(userId)]);
    return { categories, presetNames };
  } catch (error) {
    logger.error('Failed to read categories for the parser prompt', error as Error);
    return {};
  }
}

/** The user's visible categories for the word rule of the fast path (FT-143); the starter set if they cannot be read. */
export async function recordCategoriesFor(source: UserCategorySource | undefined, userId: string): Promise<CategoryOfRecord[]> {
  if (!source) return starterRecordCategories();
  try {
    return await source.recordCategories(userId);
  } catch (error) {
    logger.error('Failed to read categories for the text fast path', error as Error);
    return starterRecordCategories();
  }
}

/**
 * Learned words of the starter categories, for the category guess rule (FT-138). Without them every
 * category the words do not name stays a guess — the capture goes on.
 */
/** Words one correction taught (FT-184): they give their category on the fast path, as a guess. */
export async function tentativeWordsFor(source: LearnedCategoryWords | undefined): Promise<ReadonlyMap<string, readonly string[]>> {
  if (!source?.tentativeCategoryWords) return new Map();
  try {
    return await source.tentativeCategoryWords();
  } catch (error) {
    logger.error('Failed to read tentative category words', error as Error);
    return new Map();
  }
}

export async function learnedWordsFor(source: LearnedCategoryWords | undefined): Promise<ReadonlyMap<string, readonly string[]>> {
  if (!source) return new Map();
  try {
    return await source.learnedCategoryWords();
  } catch (error) {
    logger.error('Failed to read learned category words', error as Error);
    return new Map();
  }
}

export class ProcessTextInputUseCase {
  /** Writes what was read, as the voice path does (#301). */
  private readonly writer: ParsedRecordWriter;

  constructor(
    private openAIService: TranscriptionService,
    createTransactionUseCase: CreateTransactionUseCase,
    // Debt parsing is off (decision Д2): the parser no longer reports debts, so this stays unused
    // until the debt module is removed.
    createDebtUseCase?: CreateDebtUseCase,
    private categorySource?: UserCategorySource,
    /** Learned words, so a category a learned pattern gives is not called a guess (FT-138). */
    private learnedWords?: LearnedCategoryWords
  ) {
    this.writer = new ParsedRecordWriter(createTransactionUseCase, createDebtUseCase);
  }

  async execute(text: string, userId: string, userName?: string, options: TextInputOptions = {}): Promise<ProcessedTransaction> {
    const source: RecordSource = options.source ?? 'miniapp';
    // The user's day, not the UTC one: before 05:00 in Tashkent that is still yesterday (FT-175)
    const today = options.today ?? todayDateOnly();

    // «вчера такси 18к» is the fast paths' too: read without its day word, on the day it names (FT-175)
    const day = phraseDayOf(text, today);
    const obvious = day ? parseObviousSemanticTransaction(day.text, day.date) : null;
    const simple = obvious || !day ? null : parseSimpleTextTransaction(day.text, day.date);
    // A category no word of the record names is a guess (FT-138): the AI's own choice, or «Другое» for a
    // label nothing recognised. The same words decide whether the simple path keeps its label (FT-143)
    const learned = await learnedWordsFor(this.learnedWords);
    const local = obvious ?? (simple ? await this.withNamedCategory(simple, userId, learned, await tentativeWordsFor(this.learnedWords)) : null);
    // Fall back to OpenAI for complex/natural-language inputs, with the user's categories
    const { parsed, fastPath } = local ? { parsed: local, fastPath: true } : await this.readByAI(text, userId, simple, today);

    return this.writer.writeParsed(parsed, {
      text,
      input: 'text',
      clientId: options.clientId,
      source,
      userId,
      userName,
      fastPath,
      learned,
      today,
    });
  }

  /**
   * The simple «<label> <amount>» keeps its label only when the label — whole or by its words — names exactly
   * one of the user's visible expense categories (FT-143, by the word rule of FT-138); the record then goes
   * there by that category's name. Otherwise null and the phrase goes to the AI like a complex one: the label
   * used to be looked up whole, so «обед с командой» landed in «Другое ?» without ever reaching the AI.
   */
  private async withNamedCategory(
    simple: AnalysisResult,
    userId: string,
    learned: ReadonlyMap<string, readonly string[]>,
    tentative: ReadonlyMap<string, readonly string[]>
  ): Promise<AnalysisResult | null> {
    const [record] = simple.transactions;
    const named = categoryNamedBy(record.category, await recordCategoriesFor(this.categorySource, userId), learned, tentative);
    return named ? { ...simple, transactions: [{ ...record, category: named.name }] } : null;
  }

  /**
   * The AI's reading of the phrase. A simple «<label> <amount>» sent to it only because its label named no
   * single category is written as before when the AI fails or reads no record from it: «Другое ?» (FT-143).
   */
  private async readByAI(
    text: string,
    userId: string,
    simple: AnalysisResult | null,
    today: string
  ): Promise<{ parsed: AnalysisResult; fastPath: boolean }> {
    const ask = async () =>
      this.openAIService.analyzeInput(text, { ...(await analysisContextFor(this.categorySource, userId)), today });
    if (!simple) return { parsed: await ask(), fastPath: false };

    try {
      const parsed = await ask();
      if (parsed?.transactions?.length || parsed?.withoutAmount?.length) return { parsed, fastPath: false };
      logger.warn('The AI read no record from a simple phrase; its label is kept');
    } catch (error) {
      logger.warn('The AI could not read a simple phrase; its label is kept', errorFields(error));
    }
    return { parsed: simple, fastPath: true };
  }

  /**
   * Writes an item the phrase named without an amount, now that the person said how much (FT-123: the
   * answer to «Сколько?»). The record is the item — its category, note, date — with the answer's amount,
   * currency and account word, through the same pipeline as a parsed phrase, so its guesses read the same:
   * the text it is read from is the note and the answer («такси 18к нал»), and «18» says it was 18 000.
   * Null when the record was refused for what it says; a write that failed is a `CaptureNotSavedError` (#299).
   */
  async executeWithAmount(
    item: ItemWithoutAmount,
    answer: AmountAnswer,
    userId: string,
    userName?: string,
    options: TextInputOptions = {}
  ): Promise<DetectedTransaction | null> {
    const text = `${item.description} ${answer.text}`.trim();
    const today = options.today ?? todayDateOnly();
    const parsed: ParsedTransaction = {
      intent: 'transaction',
      amount: answer.amount,
      currency: answer.currency,
      paymentKind: answer.kind ?? item.paymentKind,
      category: item.category,
      type: item.type,
      semanticType: item.semanticType,
      needsReview: false,
      date: item.date || today,
      merchant: item.merchant,
      description: item.description,
    };
    const outcome = await this.writer.writeRecord(parsed, {
      text,
      input: 'text',
      hints: detectPaymentHints(text),
      itemCount: 1,
      // One record per answer: its id as is (FT-167)
      clientId: options.clientId,
      source: options.source ?? 'miniapp',
      userId,
      userName,
      // The parser chose the item's category when it read the phrase
      fastPath: false,
      learned: await learnedWordsFor(this.learnedWords),
      today,
    });
    // The bot checked the amount before asking to write it; any other refusal leaves the question open
    return 'written' in outcome ? outcome.written : null;
  }
}
