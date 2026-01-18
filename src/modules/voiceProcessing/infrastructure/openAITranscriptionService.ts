import OpenAI from 'openai';
import fs from 'fs';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { TranscriptionService } from '../domain/transcriptionService';
import { AppConfig } from '../../../shared/infrastructure/config/appConfig';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import { ExternalServiceError, ErrorFactory } from '../../../shared/domain/errors/AppError';
import { OPENAI_PROMPTS, ERROR_MESSAGES } from '../../../shared/domain/constants/messages';
import { transactionLearning } from '../../../shared/application/learning/transactionLearning';
import { normalizeCategory } from '../../../shared/domain/entities/Category';

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
                prompt: OPENAI_PROMPTS[AppConfig.DEFAULT_LANGUAGE.toUpperCase() as keyof typeof OPENAI_PROMPTS].TRANSCRIPTION_PROMPT
            });
            return response.text;
        } catch (error) {
            throw ErrorFactory.externalService('OpenAI Transcription', error instanceof Error ? error : undefined);
        }
    }

    async analyzeTransactions(text: string): Promise<{ amount: number; category: string; type: 'income' | 'expense'; date: string; merchant?: string; confidence?: number; description?: string }[]> {
        if (!text || text.trim().length === 0) {
            throw ErrorFactory.validation('Text input is required for transaction analysis');
        }

        try {
            const today = new Date().toISOString().split('T')[0];
            const language = AppConfig.DEFAULT_LANGUAGE.toUpperCase() as keyof typeof OPENAI_PROMPTS;
            const prompts = OPENAI_PROMPTS[language];
            
            // Enhance prompts with learned patterns
            const enhancedUserPrompt = await transactionLearning.getEnhancedPrompts(prompts.USER_ANALYZE_TRANSACTIONS);
            
            const messages: ChatCompletionMessageParam[] = [
                { role: 'system', content: prompts.SYSTEM_FINANCIAL_ASSISTANT(today) },
                { role: 'user', content: enhancedUserPrompt },
                { role: 'user', content: text }
            ];

            const response = await this.openai.chat.completions.create({
                model: AppConfig.OPENAI_MODEL,
                messages,
                response_format: { type: 'json_object' }
            });

            if (!response.choices[0]?.message?.content) {
                throw ErrorFactory.externalService('OpenAI Chat', new Error(ERROR_MESSAGES.OPENAI_ERROR));
            }

            const parseResult = this.parseOpenAIResponse(response.choices[0].message.content);
            return parseResult;
            
        } catch (error) {
            if (error instanceof ExternalServiceError) {
                throw error; // Re-throw our own errors
            }
            throw ErrorFactory.externalService('OpenAI Chat', error instanceof Error ? error : undefined);
        }
    }

    private parseOpenAIResponse(content: string): { amount: number; category: string; type: 'income' | 'expense'; date: string; merchant?: string; confidence?: number; description?: string }[] {
        let cleanContent = content.trim();
        
        // Remove markdown code block wrappers if present
        if (cleanContent.startsWith('```json')) {
            cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        try {
            const parsed = JSON.parse(cleanContent);
            
            // Handle both array and object with transactions property
            let transactions: any[];
            if (Array.isArray(parsed)) {
                transactions = parsed;
            } else if (parsed && typeof parsed === 'object' && 'transactions' in parsed) {
                transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
            } else if (parsed && typeof parsed === 'object') {
                transactions = [parsed];
            } else {
                transactions = [];
            }

            // Validate transaction structure
            return transactions.map((t, index) => {
                if (!t || typeof t !== 'object') {
                    throw ErrorFactory.externalService('OpenAI', new Error(`Invalid transaction format at index ${index}`));
                }

                // Ensure required fields exist with enhanced validation
                const amount = typeof t.amount === 'number' ? t.amount : parseFloat(t.amount) || 0;
                // Normalize category to ID (handles both Russian names and English IDs)
                const rawCategory = String(t.category || 'other');
                const category = normalizeCategory(rawCategory);
                const merchant = t.merchant ? String(t.merchant) : undefined;
                
                // Calculate confidence based on data quality
                let confidence = typeof t.confidence === 'number' ? t.confidence : 0.8;
                
                // Reduce confidence for missing/default values
                if (amount === 0) confidence = Math.min(confidence, 0.4);
                if (category === 'other' || category === 'other-income') confidence = Math.min(confidence, 0.5);
                if (!merchant && !t.merchant) confidence = Math.min(confidence, 0.6);
                
                // Ensure confidence is in valid range
                confidence = Math.max(0.1, Math.min(1.0, confidence));
                
                return {
                    amount,
                    category,
                    type: (t.type === 'income' || t.type === 'expense') ? t.type : 'expense',
                    date: String(t.date || new Date().toISOString().split('T')[0]),
                    merchant,
                    confidence,
                    description: t.description ? String(t.description) : undefined
                };
            });
            
        } catch (error) {
            console.error('Failed to parse OpenAI response:', cleanContent);
            throw ErrorFactory.externalService(
                'OpenAI Response Parser', 
                new Error(`Invalid JSON response: ${error instanceof Error ? error.message : 'Unknown parsing error'}`)
            );
        }
    }

    /**
     * Record user correction for learning
     */
    async recordCorrection(
        originalText: string,
        originalParsing: { amount: number; category: string; type: 'income' | 'expense'; merchant?: string; confidence?: number },
        userCorrection: { amount?: number; category?: string; type?: 'income' | 'expense'; merchant?: string },
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
