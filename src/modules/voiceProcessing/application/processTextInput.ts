import { ProcessedTransaction, DetectedTransaction, DetectedDebt, ItemWithoutAmount } from '../domain/processedTransaction';
import { TranscriptionService } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { DebtType } from '../../debt/domain/debtEntity';
import { DebtLimitExceededError } from '../../debt/domain/errors';
import { errorFields, getLogger, LogCategory } from '../../../shared/application/logging';
import { AnalysisContext, starterRecordCategories, UserCategorySource } from '../domain/categoryPrompt';
import { detectPaymentHints, PaymentHints, stripPaymentWords } from '../domain/paymentHints';
import { RecordSource } from '../../transaction/domain/recordSource';
import { ResolvedAccount } from '../../transaction/domain/accountResolver';
import { ResolvedCategory } from '../../transaction/domain/categoryResolver';
import { categoryNamedIn, CategoryOfRecord, LearnedCategoryWords, recordWordsOf } from '../domain/categoryGuess';
import { categoryNameKey } from '../../category/domain/category';
import { captureAssumptions } from './captureAssumptions';
import { captureMoneyOf } from './captureMoney';
import { itemClientId } from '../../transaction/domain/clientId';
import { fromMinor } from '../../../shared/domain/money/money';
import { todayDateOnly } from '../../../shared/domain/dates/dateOnly';
import { phraseDayOf } from '../domain/phraseDay';
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

/** How one parsed record is written: the phrase it came from and who writes it. */
interface RecordWrite {
  text: string;
  hints: PaymentHints;
  /**
   * Items of the phrase, the ones named without an amount too (FT-123): with one, the words of the whole
   * phrase apply to it.
   */
  itemCount: number;
  clientId?: string;
  source: RecordSource;
  userId: string;
  userName?: string;
  /** Read by a text fast path, not by the AI (FT-138). */
  fastPath: boolean;
  learned: ReadonlyMap<string, readonly string[]>;
  /** The day the phrase was said: the date of a record the parser gave none. */
  today: string;
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
export async function learnedWordsFor(source: LearnedCategoryWords | undefined): Promise<ReadonlyMap<string, readonly string[]>> {
  if (!source) return new Map();
  try {
    return await source.learnedCategoryWords();
  } catch (error) {
    logger.error('Failed to read learned category words', error as Error);
    return new Map();
  }
}

/**
 * How a record's category was set (FT-138): by the AI, or on a fast path from the label — unless the path
 * set it by the record's kind: a transfer, savings or cash withdrawal goes to «Другое», no word chose it.
 */
function categoryChosenBy(fastPath: boolean, semanticType: TransactionSemanticType): 'ai' | 'words' | 'kind' {
  if (!fastPath) return 'ai';
  return semanticType === 'expense' || semanticType === 'income' ? 'words' : 'kind';
}

export class ProcessTextInputUseCase {
  constructor(
    private openAIService: TranscriptionService,
    private createTransactionUseCase: CreateTransactionUseCase,
    // Debt parsing is off (decision Д2): the parser no longer reports debts, so this stays unused
    // until the debt module is removed.
    private createDebtUseCase?: CreateDebtUseCase,
    private categorySource?: UserCategorySource,
    /** Learned words, so a category a learned pattern gives is not called a guess (FT-138). */
    private learnedWords?: LearnedCategoryWords
  ) {}

  async execute(text: string, userId: string, userName?: string, options: TextInputOptions = {}): Promise<ProcessedTransaction> {
    const source: RecordSource = options.source ?? 'miniapp';
    // «нал», «картой», «$» in the text: which account and currency (FT-103)
    const hints = detectPaymentHints(text);
    // The user's day, not the UTC one: before 05:00 in Tashkent that is still yesterday (FT-175)
    const today = options.today ?? todayDateOnly();

    // «вчера такси 18к» is the fast paths' too: read without its day word, on the day it names (FT-175)
    const day = phraseDayOf(text, today);
    const obvious = day ? parseObviousSemanticTransaction(day.text, day.date) : null;
    const simple = obvious || !day ? null : parseSimpleTextTransaction(day.text, day.date);
    // A category no word of the record names is a guess (FT-138): the AI's own choice, or «Другое» for a
    // label nothing recognised. The same words decide whether the simple path keeps its label (FT-143)
    const learned = await learnedWordsFor(this.learnedWords);
    const local = obvious ?? (simple ? await this.withNamedCategory(simple, userId, learned) : null);
    // Fall back to OpenAI for complex/natural-language inputs, with the user's categories
    const { parsed, fastPath } = local ? { parsed: local, fastPath: true } : await this.readByAI(text, userId, simple, today);

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
    // Named without an amount: nothing is written, the bot asks «Сколько?» (FT-123). They are items of the
    // phrase all the same: «нал» in «кофе 25к, такси нал» is the taxi's, so the coffee keeps only its own words
    const withoutAmount = parsed.withoutAmount ?? [];
    const itemCount = transactions.length + withoutAmount.length;

    // Process transactions
    for (const [index, p] of transactions.entries()) {
      const written = await this.writeRecord(p, {
        text,
        hints,
        itemCount,
        clientId: options.clientId ? itemClientId(options.clientId, index) : undefined,
        source,
        userId,
        userName,
        fastPath,
        learned,
        today,
      });
      if (written) transactionResults.push(written);
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

    return { text, transactions: transactionResults, debts: debtResults, ...(withoutAmount.length ? { withoutAmount } : {}) };
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
    learned: ReadonlyMap<string, readonly string[]>
  ): Promise<AnalysisResult | null> {
    const [record] = simple.transactions;
    const label = record.category;
    const categories = (await recordCategoriesFor(this.categorySource, userId)).filter(category => category.type === 'expense');
    // The first kind of match that finds anything decides: the user's own name of a category, whole («кофе» is
    // their «Кофе», not the starter «Кафе»); then names and the dictionary by words; then learned words, which every
    // correction of every user adds to, so they never outvote the dictionary
    const tiers = [
      categories.filter(category => categoryNameKey(category.name) === categoryNameKey(label)),
      categories.filter(category => categoryNamedIn(label, category)),
      categories.filter(category => categoryNamedIn(label, category, category.presetKey ? learned.get(category.presetKey) : undefined)),
    ];
    const named = tiers.find(tier => tier.length > 0) ?? [];
    return named.length === 1 ? { ...simple, transactions: [{ ...record, category: named[0].name }] } : null;
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
    return this.writeRecord(parsed, {
      text,
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
  }

  /** One parsed record written: the money, account and category resolved, and what was assumed. */
  private async writeRecord(p: ParsedTransaction, write: RecordWrite): Promise<DetectedTransaction | null> {
    const { text, hints, userId, userName } = write;
    try {
      const type = p.type || 'expense';
      const semanticType = normalizeSemanticType(p.semanticType, type);
      const needsReview = p.needsReview === true;
      const money = captureMoneyOf(p, text, hints, write.itemCount, semanticType);
      const { currency } = money;
      const transaction: Transaction = {
        date: p.date || write.today,
        category: p.category || 'Другое',
        description: p.description || text,
        amount: money.amount,
        currency,
        source: write.source,
        ...(write.clientId ? { clientId: write.clientId } : {}),
        type,
        semanticType,
        needsReview,
        userId,
        userName,
        merchant: p.merchant,
        confidence: p.confidence,
        originalText: text,
        originalParsing: {
          amount: money.amount,
          category: p.category || 'Другое',
          type,
          semanticType,
          needsReview,
          merchant: p.merchant,
          confidence: p.confidence,
        },
      };

      // Text paths choose a category automatically, so never a hidden one (FT-099), and read the
      // account from the wording (FT-103). Moving money is not paid «налом»: no kind hint for it.
      let account: ResolvedAccount | undefined;
      let category: ResolvedCategory | undefined;
      const createResult = await this.createTransactionUseCase.execute(transaction, {
        visibleCategoriesOnly: true,
        accountHint: { text: money.accountText, kind: money.kind },
        allowCurrencyMismatch: true,
        onResolved: resolved => { account = resolved.account; category = resolved.category; },
      });
      if (!createResult.success) {
        logger.error('Failed to create transaction', null, { error: createResult.error?.message });
        return null;
      }
      return {
        id: createResult.data,
        amount: transaction.amountMinor !== undefined ? fromMinor(transaction.amountMinor) : transaction.amount,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        accountId: transaction.accountId,
        accountName: account?.name,
        assumptions: captureAssumptions({
          text,
          amount: transaction.amount,
          category: {
            name: transaction.category,
            type: transaction.type,
            presetKey: category?.presetKey ?? null,
            chosenBy: categoryChosenBy(write.fastPath, semanticType),
            words: recordWordsOf(text, p, write.itemCount),
            learnedWords: category?.presetKey ? write.learned.get(category.presetKey) : undefined,
          },
          account,
          currency,
        }),
        category: transaction.category,
        categoryId: transaction.categoryId,
        type: transaction.type,
        semanticType: transaction.semanticType,
        needsReview: transaction.needsReview,
        date: transaction.date,
        merchant: transaction.merchant,
        confidence: transaction.confidence,
        description: transaction.description,
      };
    } catch (error) {
      logger.error('Failed to create transaction from text input', error as Error, {
        transactionData: p,
        userId,
      });
      return null;
    }
  }
}
