import OpenAI from 'openai';
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
import { AnalysisContext, buildCategoryPrompt } from '../domain/categoryPrompt';
import { normalizeSemanticType } from '../../transaction/domain/transactionSemanticType';
import { createLogger, LogCategory } from '../../../shared/infrastructure/logging';

const logger = createLogger(LogCategory.OPENAI);

export class OpenAITranscriptionService implements TranscriptionService {
  private openai: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey || AppConfig.OPENAI_API_KEY;
    if (!key) {
      throw ErrorFactory.configuration('OpenAI API key is required');
    }
    this.openai = new OpenAI({ apiKey: key });
  }

  async transcribe(filePath: string): Promise<string> {
    try {
      const fileStream = fs.createReadStream(filePath);
      const response = await this.openai.audio.transcriptions.create({
        model: AppConfig.WHISPER_MODEL,
        file: fileStream,
        response_format: 'json',
        language: AppConfig.DEFAULT_LANGUAGE,
        prompt:
          OPENAI_PROMPTS[AppConfig.DEFAULT_LANGUAGE.toUpperCase() as keyof typeof OPENAI_PROMPTS]
            .TRANSCRIPTION_PROMPT,
      });
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
      const today = new Date().toISOString().split('T')[0];
      const language = AppConfig.DEFAULT_LANGUAGE.toUpperCase() as keyof typeof OPENAI_PROMPTS;
      const prompts = OPENAI_PROMPTS[language];

      // The user's own categories (FT-099), then learned patterns shown in the user's names
      const enhancedUserPrompt = await transactionLearning.getEnhancedPrompts(
        prompts.USER_ANALYZE_TRANSACTIONS(buildCategoryPrompt(context.categories)),
        context.presetNames
      );

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: prompts.SYSTEM_FINANCIAL_ASSISTANT(today) },
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

      return this.parseAnalysisResponse(response.choices[0].message.content);
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
   * Parse the new response format with items array
   */
  private parseAnalysisResponse(content: string): AnalysisResult {
    let cleanContent = content.trim();

    // Remove markdown code block wrappers if present
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

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

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        const intent = item.intent || 'transaction';

        // Debt parsing is off (decision Д2): a debt the model still reports is an expense in «Другое»
        const transaction = intent === 'debt' ? this.debtAsExpense(item) : this.parseTransactionItem(item);
        if (transaction) transactions.push(transaction);
      }

      return { transactions, debts };
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
  private debtAsExpense(item: any): ParsedTransaction | null {
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
      date: new Date().toISOString().split('T')[0],
      merchant: personName || undefined,
      confidence,
      description,
    };
  }

  /**
   * Parse a transaction item from OpenAI response
   */
  private parseTransactionItem(item: any): ParsedTransaction | null {
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

    return {
      intent: 'transaction',
      amount,
      category,
      type,
      semanticType: normalizeSemanticType(item.semanticType, type),
      needsReview: item.needsReview === true,
      date: String(item.date || new Date().toISOString().split('T')[0]),
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
