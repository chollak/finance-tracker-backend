import OpenAI from 'openai';
import fs from 'fs';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { TranscriptionService } from '../domain/transcriptionService';
import { AppConfig } from '../../../config/appConfig';
import { Result, ResultHelper } from '../../../shared/types/Result';
import { ExternalServiceError, ErrorFactory } from '../../../shared/errors/AppError';
import { OPENAI_PROMPTS, ERROR_MESSAGES } from '../../../shared/constants/messages';

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

    async analyzeTransactions(text: string): Promise<{ amount: number; category: string; type: 'income' | 'expense'; date: string }[]> {
        if (!text || text.trim().length === 0) {
            throw ErrorFactory.validation('Text input is required for transaction analysis');
        }

        try {
            const today = new Date().toISOString().split('T')[0];
            const language = AppConfig.DEFAULT_LANGUAGE.toUpperCase() as keyof typeof OPENAI_PROMPTS;
            const prompts = OPENAI_PROMPTS[language];
            
            const messages: ChatCompletionMessageParam[] = [
                { role: 'system', content: prompts.SYSTEM_FINANCIAL_ASSISTANT(today) },
                { role: 'user', content: prompts.USER_ANALYZE_TRANSACTIONS },
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

    private parseOpenAIResponse(content: string): { amount: number; category: string; type: 'income' | 'expense'; date: string }[] {
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
                
                // Ensure required fields exist with basic validation
                return {
                    amount: typeof t.amount === 'number' ? t.amount : parseFloat(t.amount) || 0,
                    category: String(t.category || 'Other'),
                    type: (t.type === 'income' || t.type === 'expense') ? t.type : 'expense',
                    date: String(t.date || new Date().toISOString().split('T')[0])
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
}
