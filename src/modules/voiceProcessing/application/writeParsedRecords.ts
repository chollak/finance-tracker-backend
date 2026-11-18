import {
  ProcessedTransaction,
  DetectedTransaction,
  DetectedDebt,
  ItemWithoutAmount,
  NotWrittenItem,
  NotWrittenReason,
} from '../domain/processedTransaction';
import { AnalysisResult, ParsedDebt, ParsedTransaction } from '../domain/transcriptionService';
import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { CreateDebtUseCase } from '../../debt/application/createDebt';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { DebtType } from '../../debt/domain/debtEntity';
import { DebtLimitExceededError } from '../../debt/domain/errors';
import { getLogger, LogCategory } from '../../../shared/application/logging';
import { detectPaymentHints, PaymentHints } from '../domain/paymentHints';
import { RecordSource } from '../../transaction/domain/recordSource';
import { ResolvedAccount } from '../../transaction/domain/accountResolver';
import { ResolvedCategory } from '../../transaction/domain/categoryResolver';
import { recordWordsOf } from '../domain/categoryGuess';
import { captureAssumptions } from './captureAssumptions';
import { captureMoneyOf } from './captureMoney';
import { debtLogFields, transactionLogFields } from './captureLogFields';
import { itemClientId } from '../../transaction/domain/clientId';
import { fromMinor } from '../../../shared/domain/money/money';
import { readTextAmounts } from '../domain/textAmounts';
import { normalizeSemanticType, TransactionSemanticType } from '../../transaction/domain/transactionSemanticType';
import { conservativeKeywordPattern, REPAYMENT_KEYWORDS_PATTERN } from '../../../shared/domain/semantics/semanticKeywords';
import { AppError, ValidationError } from '../../../shared/domain/errors/AppError';
import { MAX_RECORD_AMOUNT_MINOR, noteWithinLimit } from '../../../shared/application/validation/validators';
import { MINOR_PER_MAJOR } from '../../../shared/domain/money/money';
import { CaptureNotSavedError } from '../domain/voiceErrors';

/**
 * The one place a parsed phrase becomes records (#301): what the text and the voice paths both call once the phrase
 * is read — by a text fast path or by the AI. The checks of the reading against the phrase and the write itself live
 * here, so a fix to either is made once.
 */

const logger = getLogger(LogCategory.OPENAI);

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
 * How a record's category was set (FT-138): by the AI, or on a fast path from the label — unless the path
 * set it by the record's kind: a transfer, savings or cash withdrawal goes to «Другое», no word chose it.
 */
function categoryChosenBy(fastPath: boolean, semanticType: TransactionSemanticType): 'ai' | 'words' | 'kind' {
  if (!fastPath) return 'ai';
  return semanticType === 'expense' || semanticType === 'income' ? 'words' : 'kind';
}

/**
 * A refusal of the record itself (#299) — an amount over the limit, no visible account: a `4xx` of the create use
 * case. The same record sent again would be refused again, so it is not a failure to send again.
 */
function isRefusalOfTheRecord(error: unknown): error is AppError {
  return error instanceof AppError && error.statusCode < 500;
}

function refusalReason(error: AppError, amount: number): NotWrittenReason {
  if (!(error instanceof ValidationError)) return 'refused';
  // The account resolver's «No visible account to record into»: no account is picked on this path, so that is it
  if (error.field === 'accountId') return 'no_account';
  if (error.field !== 'amount') return 'refused';
  return amount * MINOR_PER_MAJOR > MAX_RECORD_AMOUNT_MINOR ? 'amount_too_large' : 'amount_invalid';
}

/** How often the records of a phrase that was not saved whole are tried to be taken back, and the pause between. */
const TAKE_BACK_PASSES = 3;
const TAKE_BACK_PAUSE_MS = 300;

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** How the phrase names a record that was not written: its note, else its merchant, else its category. */
function nameOf(p: ParsedTransaction): string {
  return p.description?.trim() || p.merchant?.trim() || p.category || 'Другое';
}

/** What became of one parsed record: written, or refused for what it says. A failed write is thrown, not returned. */
export type RecordOutcome =
  /** `repeated`: the `clientId` was written before (FT-106) — nothing new was created by this write. */
  | { written: DetectedTransaction; repeated: boolean }
  | { refused: NotWrittenItem };

/** Who writes and where from: the same for every record of a phrase. */
interface WriteContext {
  /** The phrase: typed, or heard in a voice. */
  text: string;
  /** How the phrase came — only the log line of a failed write says it. */
  input: 'text' | 'voice';
  source: RecordSource;
  userId: string;
  userName?: string;
  /** Read by a text fast path, not by the AI (FT-138). */
  fastPath: boolean;
  learned: ReadonlyMap<string, readonly string[]>;
  /** The day the phrase was said: the date of a record the parser gave none. */
  today: string;
  /** The note of a record the parser gave none; the phrase itself when absent. */
  noteFallback?: string;
}

/** A parsed phrase to write. */
export interface PhraseWrite extends WriteContext {
  /** The client's id for the capture (FT-106); its records get «<id>», «<id>:1», … */
  clientId?: string;
}

/** How one parsed record is written: the phrase it came from and who writes it. */
export interface RecordWrite extends WriteContext {
  hints: PaymentHints;
  /**
   * Items of the phrase, the ones named without an amount too (FT-123): with one, the words of the whole
   * phrase apply to it.
   */
  itemCount: number;
  /** This record's own id, as is. */
  clientId?: string;
}

export class ParsedRecordWriter {
  constructor(
    private createTransactionUseCase: CreateTransactionUseCase,
    // Debt parsing is off (decision Д2): the parser no longer reports debts, so this stays unused
    // until the debt module is removed.
    private createDebtUseCase?: CreateDebtUseCase
  ) {}

  /**
   * Everything a parsed phrase holds, written: its records checked against the phrase first, its debts, and the items
   * named without an amount handed back for the «Сколько?» question.
   */
  async writeParsed(parsed: AnalysisResult, phrase: PhraseWrite): Promise<ProcessedTransaction> {
    const { text } = phrase;
    // «нал», «картой», «$» in the phrase: which account and currency (FT-103)
    const hints = detectPaymentHints(text);

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
    // Named without an amount: nothing is written, the bot asks «Сколько?» (FT-123). They are items of the
    // phrase all the same: «нал» in «кофе 25к, такси нал» is the taxi's, so the coffee keeps only its own words
    const withoutAmount = parsed.withoutAmount ?? [];
    const itemCount = transactions.length + withoutAmount.length;

    // Refused for what they say: named with the reason, the rest of the phrase is written (#299)
    const notWritten: NotWrittenItem[] = [];
    // Created by this call — not found by their `clientId` — so they are this call's to take back
    const created: string[] = [];
    // What became of each record so far, by its place in the phrase
    const outcomes: RecordOutcome[] = [];

    try {
      for (const [index, p] of transactions.entries()) {
        const outcome = await this.writeRecord(p, {
          ...phrase,
          hints,
          itemCount,
          // A refused record keeps its number, so the same phrase sent again names the same records
          clientId: phrase.clientId ? itemClientId(phrase.clientId, index) : undefined,
        });
        outcomes.push(outcome);
        if ('refused' in outcome) {
          notWritten.push(outcome.refused);
          continue;
        }
        transactionResults.push(outcome.written);
        if (!outcome.repeated) created.push(outcome.written.id);
      }
    } catch (error) {
      // A phrase is written whole or not at all (#299): with a part of it written, the same `clientId` sent again
      // would be answered as a repeat with that part, and the rest would be lost for good
      const left = await this.takeBack(created, phrase);
      if (left.length === 0) throw error;
      // Not all of it could be taken back — the database stayed busy. The answer says what is in the database, never
      // «nothing was saved»: a person told so sends the whole phrase again and gets the records that stayed twice
      return this.savedInPart(transactions, outcomes, new Set(created.filter(id => !left.includes(id))), phrase, withoutAmount);
    }

    const debtResults = await this.writeDebts(debts, phrase);

    return {
      text,
      transactions: transactionResults,
      debts: debtResults,
      ...(withoutAmount.length ? { withoutAmount } : {}),
      ...(notWritten.length ? { notWritten } : {}),
    };
  }

  /**
   * Removes the records of a phrase written before one of them failed, the last first, and returns the ids of those
   * still there. A database busy for the write is likely busy for this too, so it is tried in `TAKE_BACK_PASSES`
   * passes with a pause between; a pass stops at its first failure — the rest would wait for the same lock — so the
   * whole of it takes at most the passes times the connection's busy timeout.
   */
  private async takeBack(created: string[], phrase: WriteContext): Promise<string[]> {
    let left = [...created].reverse();
    let lastError: unknown;
    for (let pass = 1; left.length > 0 && pass <= TAKE_BACK_PASSES; pass += 1) {
      if (pass > 1) await pause(TAKE_BACK_PAUSE_MS);
      for (const id of [...left]) {
        try {
          await this.createTransactionUseCase.takeBack(id, phrase.userId);
          left = left.filter(other => other !== id);
        } catch (error) {
          lastError = error;
          break;
        }
      }
    }
    for (const id of left) {
      logger.error(`A record of a ${phrase.input} input that was not saved whole could not be taken back`, lastError as Error, {
        transactionId: id,
        userId: phrase.userId,
      });
    }
    return left;
  }

  /**
   * The answer for a phrase whose write failed and whose written records could not all be taken back (#299): the
   * records still in the database as written — those that stayed, and those found by their `clientId` — and every
   * other record of the phrase `not_saved`: the one that failed, the ones taken back, the ones never reached. The
   * same `clientId` sent again finds the same records, so both answers say one thing.
   */
  private savedInPart(
    transactions: ParsedTransaction[],
    outcomes: RecordOutcome[],
    takenBack: ReadonlySet<string>,
    phrase: WriteContext,
    withoutAmount: ItemWithoutAmount[]
  ): ProcessedTransaction {
    const written: DetectedTransaction[] = [];
    const notWritten: NotWrittenItem[] = [];
    for (const [index, p] of transactions.entries()) {
      const outcome = outcomes[index];
      if (outcome && 'refused' in outcome) notWritten.push(outcome.refused);
      else if (outcome && !takenBack.has(outcome.written.id)) written.push(outcome.written);
      else notWritten.push({ description: nameOf(p), reason: 'not_saved' });
    }
    // Counts only: the names are the user's words (#269)
    logger.error(`A ${phrase.input} input was saved in part: its other records are answered as not saved`, null, {
      written: written.length,
      notSaved: notWritten.filter(item => item.reason === 'not_saved').length,
      userId: phrase.userId,
    });
    return { text: phrase.text, transactions: written, debts: [], ...(withoutAmount.length ? { withoutAmount } : {}), notWritten };
  }

  /**
   * One parsed record written: the money, account and category resolved, and what was assumed. A record refused for
   * what it says comes back named with the reason; a write that failed is a `CaptureNotSavedError` (#299) — it used to
   * be dropped with a line in the log, and the answer was «не нашёл операцию».
   */
  async writeRecord(p: ParsedTransaction, write: RecordWrite): Promise<RecordOutcome> {
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
        // Within the limit of an edit: a record with a longer note could not be edited (#299)
        description: noteWithinLimit(p.description || (write.noteFallback ?? text)),
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

      // The category is chosen automatically, so never a hidden one (FT-099), and the account is read
      // from the wording (FT-103). Moving money is not paid «налом»: no kind hint for it.
      let account: ResolvedAccount | undefined;
      let category: ResolvedCategory | undefined;
      let repeated = false;
      const createResult = await this.createTransactionUseCase.execute(transaction, {
        visibleCategoriesOnly: true,
        accountHint: { text: money.accountText, kind: money.kind },
        allowCurrencyMismatch: true,
        onResolved: resolved => { account = resolved.account; category = resolved.category; },
        onRepeat: () => { repeated = true; },
      });
      if (!createResult.success) {
        if (!isRefusalOfTheRecord(createResult.error)) throw createResult.error;
        const reason = refusalReason(createResult.error, money.amount);
        // The reason and the field, not the refusal's words: a message may name a category or an account (#269)
        logger.warn(`A record of a ${write.input} input was refused`, {
          reason,
          code: createResult.error.code,
          ...(createResult.error instanceof ValidationError && createResult.error.field ? { field: createResult.error.field } : {}),
          transaction: transactionLogFields(p),
          userId,
        });
        return { refused: { description: nameOf(p), reason, ...(reason === 'no_account' ? { currency } : {}) } };
      }
      const written: DetectedTransaction = {
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
      return { written, repeated };
    } catch (error) {
      logger.error(`Failed to create transaction from ${write.input} input`, error as Error, {
        transaction: transactionLogFields(p),
        userId,
      });
      throw new CaptureNotSavedError();
    }
  }

  /** The phrase's debts, if the debt module is there. Until #266: the parser reports none (decision Д2). */
  private async writeDebts(debts: ParsedDebt[], phrase: WriteContext): Promise<DetectedDebt[]> {
    const debtResults: DetectedDebt[] = [];
    if (!this.createDebtUseCase) return debtResults;

    for (const d of debts) {
      try {
        const debtType = d.debtType === 'i_owe' ? DebtType.I_OWE : DebtType.OWED_TO_ME;

        const result = await this.createDebtUseCase.execute({
          userId: phrase.userId,
          type: debtType,
          personName: d.personName,
          amount: d.amount,
          description: d.description || (phrase.noteFallback ?? phrase.text),
          dueDate: d.dueDate || undefined,
          moneyTransferred: d.moneyTransferred,
        });

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
        logger.error(`Failed to create debt from ${phrase.input} input`, error as Error, {
          debt: debtLogFields(d),
          userId: phrase.userId,
        });
      }
    }

    return debtResults;
  }
}
