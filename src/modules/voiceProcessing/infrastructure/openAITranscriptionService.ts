import OpenAI, { ClientOptions } from 'openai';
import fs from 'fs';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import {
  TranscriptionService,
  ParsedTransaction,
  ParsedDebt,
  AnalysisResult,
} from '../domain/transcriptionService';
import { AppConfig } from '../../../shared/infrastructure/config/appConfig';
import { ExternalServiceError, ErrorFactory } from '../../../shared/domain/errors/AppError';
import { OPENAI_PROMPTS, ERROR_MESSAGES } from '../../../shared/domain/constants/messages';
import { transactionLearning } from '../../../shared/application/learning/transactionLearning';
import { AnalysisContext, buildCategoryPrompt, buildExpenseCategoryPrompt } from '../domain/categoryPrompt';
import { ItemWithoutAmount } from '../domain/processedTransaction';
import { normalizeSemanticType } from '../../transaction/domain/transactionSemanticType';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';
import { addDaysToDateOnly, todayDateOnly, weekdayOfDateOnly } from '../../../shared/domain/dates/dateOnly';

const logger = createLogger(LogCategory.OPENAI);

/** The 7 days up to `today`, newest first: «воскресенье 2026-10-25, суббота 2026-10-24, …». */
function weekUpTo(today: string, locale: string): string {
  return Array.from({ length: 7 }, (_, back) => addDaysToDateOnly(today, -back))
    .map(date => `${weekdayOfDateOnly(date, locale)} ${date}`)
    .join(', ');
}

/** The JSON of an answer, without the ```json fence a model sometimes wraps it in. */
function withoutCodeFence(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('```json')) return trimmed.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  if (trimmed.startsWith('```')) return trimmed.replace(/^```\s*/, '').replace(/\s*```$/, '');
  return trimmed;
}

export class OpenAITranscriptionService implements TranscriptionService {
  private openai: OpenAI;

  /** `options.fetch` replaces the network in tests. */
  constructor(apiKey?: string, options: Pick<ClientOptions, 'fetch'> = {}) {
    const key = apiKey || AppConfig.OPENAI_API_KEY;
    if (!key) {
      throw ErrorFactory.configuration('OpenAI API key is required');
    }
    this.openai = new OpenAI({
      apiKey: key,
      timeout: AppConfig.OPENAI_TIMEOUT_MS,
      maxRetries: AppConfig.OPENAI_MAX_RETRIES,
      ...options,
    });
  }

  async transcribe(filePath: string): Promise<string> {
    try {
      const fileStream = fs.createReadStream(filePath);
      const response = await this.openai.audio.transcriptions.create(
        {
          model: AppConfig.WHISPER_MODEL,
          file: fileStream,
          response_format: 'json',
          language: AppConfig.DEFAULT_LANGUAGE,
          prompt:
            OPENAI_PROMPTS[AppConfig.DEFAULT_LANGUAGE.toUpperCase() as keyof typeof OPENAI_PROMPTS]
              .TRANSCRIPTION_PROMPT,
        },
        // No retry (FT-145): the file goes up as a stream, which cannot be sent a second time
        { maxRetries: 0 }
      );
      return response.text;
    } catch (error) {
      throw ErrorFactory.externalService(
        'OpenAI Transcription',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Analyze text and extract both transactions and debts
   */
  async analyzeInput(text: string, context: AnalysisContext = {}): Promise<AnalysisResult> {
    if (!text || text.trim().length === 0) {
      throw ErrorFactory.validation('Text input is required for analysis');
    }

    try {
      // The user's day, not the UTC one: before 05:00 in Tashkent that is still yesterday (FT-175)
      const today = context.today ?? todayDateOnly();
      const language = AppConfig.DEFAULT_LANGUAGE.toUpperCase() as keyof typeof OPENAI_PROMPTS;
      const prompts = OPENAI_PROMPTS[language];

      // The user's own categories (FT-099), then learned patterns shown in the user's names
      const enhancedUserPrompt = await transactionLearning.getEnhancedPrompts(
        prompts.USER_ANALYZE_TRANSACTIONS(buildCategoryPrompt(context.categories)),
        context.presetNames
      );

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: prompts.SYSTEM_FINANCIAL_ASSISTANT(today, weekdayOfDateOnly(today, prompts.LOCALE), weekUpTo(today, prompts.LOCALE)),
        },
        { role: 'user', content: enhancedUserPrompt },
        { role: 'user', content: text },
      ];

      const response = await this.openai.chat.completions.create({
        model: AppConfig.OPENAI_MODEL,
        messages,
        response_format: { type: 'json_object' },
      });

      if (!response.choices[0]?.message?.content) {
        throw ErrorFactory.externalService('OpenAI Chat', new Error(ERROR_MESSAGES.OPENAI_ERROR));
      }

      return this.parseAnalysisResponse(response.choices[0].message.content, today);
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw ErrorFactory.externalService(
        'OpenAI Chat',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * The category of a card payment by its merchant alone (FT-176): the user's expense categories and the learned
   * patterns are the list, the merchant is a message of its own, and the answer is one name — «Другое» when the model
   * gives none. A failure throws: the caller writes the payment into «Другое» with a «?».
   */
  async categoryOfMerchant(merchant: string, context: AnalysisContext = {}): Promise<string> {
    try {
      const prompts = OPENAI_PROMPTS[AppConfig.DEFAULT_LANGUAGE.toUpperCase() as keyof typeof OPENAI_PROMPTS];
      const userPrompt = await transactionLearning.getEnhancedPrompts(
        prompts.USER_MERCHANT_CATEGORY(buildExpenseCategoryPrompt(context.categories)),
        context.presetNames
      );
      const response = await this.openai.chat.completions.create({
        model: AppConfig.OPENAI_MODEL,
        messages: [
          { role: 'system', content: prompts.SYSTEM_MERCHANT_CATEGORY },
          { role: 'user', content: userPrompt },
          { role: 'user', content: merchant },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error(ERROR_MESSAGES.OPENAI_ERROR);
      const category = JSON.parse(withoutCodeFence(content))?.category;
      return typeof category === 'string' && category.trim() ? category.trim() : 'Другое';
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw ErrorFactory.externalService('OpenAI Chat', error instanceof Error ? error : undefined);
    }
  }

  /**
   * @deprecated Use analyzeInput instead
   * Kept for backward compatibility
   */
  async analyzeTransactions(
    text: string
  ): Promise<ParsedTransaction[]> {
    const result = await this.analyzeInput(text);
    return result.transactions;
  }

  /**
   * Parse the new response format with items array; an item without a date gets `today`
   */
  private parseAnalysisResponse(content: string, today: string = todayDateOnly()): AnalysisResult {
    const cleanContent = withoutCodeFence(content);

    try {
      const parsed = JSON.parse(cleanContent);

      // Handle different response formats
      let items: any[];
      if (Array.isArray(parsed)) {
        // Old format: direct array
        items = parsed;
      } else if (parsed && typeof parsed === 'object' && 'items' in parsed) {
        // New format: { items: [...] }
        items = Array.isArray(parsed.items) ? parsed.items : [];
      } else if (parsed && typeof parsed === 'object' && 'transactions' in parsed) {
        // Legacy format: { transactions: [...] }
        items = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      } else if (parsed && typeof parsed === 'object') {
        // Single item
        items = [parsed];
      } else {
        items = [];
      }

      const transactions: ParsedTransaction[] = [];
      const debts: ParsedDebt[] = [];
      const withoutAmount: ItemWithoutAmount[] = [];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        const intent = item.intent || 'transaction';

        // Debt parsing is off (decision Д2): a debt the model still reports is an expense in «Другое»
        const transaction = intent === 'debt' ? this.debtAsExpense(item, today) : this.parseTransactionItem(item, today);
        if (transaction) transactions.push(transaction);
        // Named without an amount: kept aside, the bot asks how much (FT-123)
        const unpriced = !transaction && intent !== 'debt' ? this.parseItemWithoutAmount(item, today) : null;
        if (unpriced) withoutAmount.push(unpriced);
      }

      return { transactions, debts, ...(withoutAmount.length ? { withoutAmount } : {}) };
    } catch (error) {
      logger.error('Failed to parse OpenAI response', error as Error, { content: cleanContent.substring(0, 200) });
      throw ErrorFactory.externalService(
        'OpenAI Response Parser',
        new Error(
          `Invalid JSON response: ${error instanceof Error ? error.message : 'Unknown parsing error'}`
        )
      );
    }
  }

  /**
   * A debt item («одолжил», «взял в долг», «кредит», «рассрочка») becomes an ordinary expense in
   * «Другое» — decision Д2; the debt module stays but is no longer filled from text.
   */
  private debtAsExpense(item: any, today: string): ParsedTransaction | null {
    const amount = typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0;
    if (amount <= 0) return null;

    const personName = item.personName ? String(item.personName).trim() : '';
    const description = item.description ? String(item.description) : personName || undefined;
    const confidence = typeof item.confidence === 'number' ? Math.max(0.1, Math.min(1.0, item.confidence)) : 0.8;

    return {
      intent: 'transaction',
      amount,
      category: 'Другое',
      type: 'expense',
      semanticType: 'expense',
      needsReview: false,
      date: today,
      merchant: personName || undefined,
      confidence,
      description,
    };
  }

  /**
   * An item the model returned without an amount («такси» in «кофе 25к, такси»): what it is and where it
   * would go, so the bot can ask «Сколько?» (FT-123). An item that names nothing is dropped. Without a date of its
   * own it gets the phrase's day, as a record does: the answer may come the next morning (FT-182).
   */
  private parseItemWithoutAmount(item: any, today: string): ItemWithoutAmount | null {
    const amount = typeof item.amount === 'number' ? item.amount : parseFloat(item.amount);
    if (Number.isFinite(amount) && amount !== 0) return null;
    const description = String(item.description || item.merchant || '').trim();
    if (!description) return null;
    const type = item.type === 'income' ? 'income' : 'expense';
    const paymentKind = item.account === 'cash' || item.account === 'card' ? item.account : undefined;
    return {
      description,
      category: String(item.category || '').trim() || 'Другое',
      type,
      semanticType: normalizeSemanticType(item.semanticType, type),
      date: String(item.date || today),
      ...(paymentKind ? { paymentKind } : {}),
      ...(item.merchant ? { merchant: String(item.merchant) } : {}),
    };
  }

  /**
   * Parse a transaction item from OpenAI response
   */
  private parseTransactionItem(item: any, today: string): ParsedTransaction | null {
    const amount = typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0;
    if (amount <= 0) return null;

    // The name the model chose; the user's category is resolved on create (FT-099)
    const category = String(item.category || '').trim() || 'Другое';
    const merchant = item.merchant ? String(item.merchant) : undefined;

    let confidence = typeof item.confidence === 'number' ? item.confidence : 0.8;
    if (amount === 0) confidence = Math.min(confidence, 0.4);
    if (category.toLocaleLowerCase('ru-RU') === 'другое') confidence = Math.min(confidence, 0.5);
    if (!merchant && !item.merchant) confidence = Math.min(confidence, 0.6);
    confidence = Math.max(0.1, Math.min(1.0, confidence));

    const type = item.type === 'income' || item.type === 'expense' ? item.type : 'expense';
    const paymentKind = item.account === 'cash' || item.account === 'card' ? item.account : undefined;

    return {
      intent: 'transaction',
      amount,
      category,
      currency: String(item.currency ?? '').toUpperCase() === 'USD' ? 'USD' : 'UZS',
      paymentKind,
      type,
      semanticType: normalizeSemanticType(item.semanticType, type),
      needsReview: item.needsReview === true,
      date: String(item.date || today),
      merchant,
      confidence,
      description: item.description ? String(item.description) : undefined,
    };
  }

  /**
   * Record user correction for learning
   */
  async recordCorrection(
    originalText: string,
    originalParsing: {
      amount: number;
      category: string;
      type: 'income' | 'expense';
      merchant?: string;
      confidence?: number;
    },
    userCorrection: {
      amount?: number;
      category?: string;
      type?: 'income' | 'expense';
      merchant?: string;
    },
    userId: string
  ): Promise<void> {
    await transactionLearning.recordCorrection(
      originalText,
      originalParsing,
      userCorrection,
      userId,
      originalParsing.confidence || 0.8
    );
  }
}
