import { CreateTransactionUseCase } from '../../transaction/application/createTransaction';
import { Transaction } from '../../transaction/domain/transactionEntity';
import { APPLE_PAY_SOURCE, RecordCurrency } from '../../transaction/domain/recordSource';
import { ResolvedAccount } from '../../transaction/domain/accountResolver';
import { ResolvedCategory } from '../../transaction/domain/categoryResolver';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { fromMinor } from '../../../shared/domain/money/money';
import { errorFields, getLogger, LogCategory } from '../../../shared/application/logging';
import { TranscriptionService } from '../domain/transcriptionService';
import { UserCategorySource } from '../domain/categoryPrompt';
import { categoryNamedBy, categoryNamedIn, LearnedCategoryWords } from '../domain/categoryGuess';
import { CaptureAssumption, DetectedTransaction } from '../domain/processedTransaction';
import { analysisContextFor, learnedWordsFor, recordCategoriesFor } from './processTextInput';

const logger = getLogger(LogCategory.TRANSACTION);

/** The note of a payment Wallet gave no merchant for: says where it came from. */
const NOTE_WITHOUT_MERCHANT = 'Оплата Apple Pay';
const OTHER = 'Другое';

export interface RecordPaymentInput {
  userId: string;
  userName?: string;
  /** Exactly as it came, in minor units of `currency`. */
  amountMinor: number;
  currency: RecordCurrency;
  merchant?: string;
  /** The account the phone maps the card to, by name. */
  accountName?: string;
  clientId: string;
  /** YYYY-MM-DD on the user's calendar: the day of the payment. */
  date: string;
}

/** How the category was chosen: by the merchant's words, by the AI, or «Другое» because neither could. */
type CategoryChoice = { name: string; chosenBy: 'words' | 'ai' | 'fallback' };

/**
 * Writes a card payment the iOS app sent ready (FT-176): the amount, currency and day as they came, never parsed like
 * a phrase. The category is the one the merchant names — the user's category name, the dictionary, learned words — else
 * the AI's choice of the category alone, else «Другое»; either of the last two is a guess («?»). The account is the
 * one of exactly the card's account name — the phone's names are typed by hand; any other awaits review.
 */
export class RecordPaymentUseCase {
  constructor(
    private openAIService: TranscriptionService,
    private createTransactionUseCase: CreateTransactionUseCase,
    private categorySource?: UserCategorySource,
    private learnedWords?: LearnedCategoryWords
  ) {}

  async execute(input: RecordPaymentInput): Promise<Result<DetectedTransaction>> {
    const learned = await learnedWordsFor(this.learnedWords);
    const choice = await this.categoryOf(input.merchant, input.userId, learned);
    const note = input.merchant ?? NOTE_WITHOUT_MERCHANT;
    const amount = fromMinor(input.amountMinor);
    const transaction: Transaction = {
      date: input.date,
      category: choice.name,
      description: note,
      amount,
      amountMinor: input.amountMinor,
      currency: input.currency,
      source: APPLE_PAY_SOURCE,
      clientId: input.clientId,
      type: 'expense',
      semanticType: 'expense',
      needsReview: false,
      userId: input.userId,
      userName: input.userName,
      merchant: input.merchant,
      // The words a correction teaches (FT-138, FT-184): the merchant's, for the next payment there — never the
      // note of a payment without one, which is the server's words
      originalText: input.merchant,
    };

    let account: ResolvedAccount | undefined;
    let category: ResolvedCategory | undefined;
    const created = await this.createTransactionUseCase.execute(transaction, {
      visibleCategoriesOnly: true,
      // Typed by hand on the phone, so only the whole name counts: «Humo Black» is not «Humo» (FT-176 review)
      accountHint: { name: input.accountName, reviewUnlessNamed: true },
      allowCurrencyMismatch: true,
      onResolved: resolved => {
        account = resolved.account;
        category = resolved.category;
        // Told before the record is stored: what the parse gave is the category it went to, not the AI's raw name
        transaction.originalParsing = {
          amount, category: resolved.category?.name ?? choice.name, type: 'expense', semanticType: 'expense', needsReview: false,
          merchant: input.merchant,
        };
      },
    });
    if (!created.success) return ResultHelper.failure(created.error);

    return ResultHelper.success({
      id: created.data,
      amount,
      amountMinor: input.amountMinor,
      currency: transaction.currency,
      accountId: transaction.accountId,
      accountName: account?.name,
      assumptions: paymentAssumptions({ merchant: input.merchant ?? '', choice, category, learned, account, currency: input.currency }),
      category: transaction.category,
      categoryId: transaction.categoryId,
      type: 'expense',
      semanticType: 'expense',
      needsReview: transaction.needsReview,
      date: transaction.date,
      merchant: input.merchant,
      description: note,
    });
  }

  private async categoryOf(
    merchant: string | undefined,
    userId: string,
    learned: ReadonlyMap<string, readonly string[]>
  ): Promise<CategoryChoice> {
    if (!merchant) return { name: OTHER, chosenBy: 'fallback' };
    const named = categoryNamedBy(merchant, await recordCategoriesFor(this.categorySource, userId), learned);
    if (named) return { name: named.name, chosenBy: 'words' };
    try {
      const name = await this.openAIService.categoryOfMerchant(merchant, await analysisContextFor(this.categorySource, userId));
      return { name, chosenBy: 'ai' };
    } catch (error) {
      logger.warn('The AI could not choose the category of a payment; it goes to «Другое»', errorFields(error));
      return { name: OTHER, chosenBy: 'fallback' };
    }
  }
}

/**
 * What a payment's record took for granted: a category its merchant does not name (FT-138: the AI's choice, «Другое»),
 * the account when it is not the one of the card's name, dollars on a сум account. Never «thousands»: the amount came
 * as it is.
 */
function paymentAssumptions(input: {
  merchant: string;
  choice: CategoryChoice;
  category?: ResolvedCategory;
  learned: ReadonlyMap<string, readonly string[]>;
  account?: ResolvedAccount;
  currency: RecordCurrency;
}): CaptureAssumption[] {
  const assumptions: CaptureAssumption[] = [];
  const { category, account } = input;
  const name = category?.name ?? input.choice.name;
  const learnedWords = category?.presetKey ? input.learned.get(category.presetKey) : undefined;
  const namedByMerchant = category
    ? categoryNamedIn(input.merchant, { name, type: category.type, presetKey: category.presetKey }, learnedWords)
    : false;
  if (input.choice.chosenBy !== 'words' && !namedByMerchant) {
    assumptions.push({ kind: 'category', name });
  }

  if (account) {
    assumptions.push({ kind: 'account', name: account.name, reason: account.matchedBy === 'name' ? 'hint' : 'default' });
    if (input.currency === 'USD' && account.currency !== 'USD') {
      assumptions.push({ kind: 'currency', currency: 'USD', reason: 'no_usd_account' });
    }
  }
  return assumptions;
}
