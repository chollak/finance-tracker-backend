import OpenAI from 'openai';
import fs from 'fs';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

export class OpenAITranscriptionService {
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
        });
        return response.text;
    }

    async analyzeText(text: string): Promise<{ amount: number; category: string; type: 'income' | 'expense' }> {
        const messages: ChatCompletionMessageParam[] = [
            { role: 'system', content: 'Ты финансовый ассистент. Всегда возвращай ответ в формате JSON.' },
            { role: 'user', content: `Проанализируй текст и извлеки сумму, категорию и тип транзакции.
                Если текст содержит слова, связанные с доходами ("заработал", "получил", "перевели"), тип должен быть "income".
                Если текст содержит слова, связанные с расходами ("купил", "заплатил", "потратил"), тип должен быть "expense".
                Пример текста: "Мне перевели 5000 рублей за фриланс".
                Ответ в формате JSON: {"amount": 5000, "category": "Работа", "type": "income"}.
                Текст: "${text}"
            ` }
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
