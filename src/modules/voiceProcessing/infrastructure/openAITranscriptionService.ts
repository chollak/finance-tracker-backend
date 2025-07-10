import OpenAI from 'openai';
import fs from 'fs';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { TranscriptionService } from '../domain/transcriptionService';

export class OpenAITranscriptionService implements TranscriptionService {
    private openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({ apiKey });
    }

    async transcribe(filePath: string): Promise<string> {
        const fileStream = fs.createReadStream(filePath);
        const response = await this.openai.audio.transcriptions.create({
            model: 'whisper-1',
            file: fileStream,
            response_format: 'json',
            language: 'ru',
            prompt: 'финансовые транзакции'
        });
        return response.text;
    }

    async analyzeTransactions(text: string): Promise<{ amount: number; category: string; type: 'income' | 'expense'; date: string }[]> {
        const today = new Date().toISOString().split('T')[0];
        const messages: ChatCompletionMessageParam[] = [
            { role: 'system', content: 'Ты финансовый ассистент. Сегодня ' + today + '. Всегда возвращай ответ в формате JSON.' },
            { role: 'user', content: `Проанализируй текст и извлеки все транзакции. Каждая транзакция должна содержать сумму, категорию, тип (income или expense) и дату в формате ISO. Если встречаются слова вроде "вчера" или "позавчера", вычисли фактическую дату относительно сегодняшнего дня.` },
            { role: 'user', content: text }
        ];

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4-turbo',
            messages,
            response_format: { type: 'json_object' },
        });

        if (!response.choices[0].message.content) {
            throw new Error('Empty response from OpenAI API');
        }

        return JSON.parse(response.choices[0].message.content);
    }
}
