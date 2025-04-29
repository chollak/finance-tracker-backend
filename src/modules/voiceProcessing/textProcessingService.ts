import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analyzeSpending(text: string): Promise<{ amount: number; category: string; type: "income" | "expense" }> {
    try {
        const messages: ChatCompletionMessageParam[] = [
            { role: "system", content: "Ты финансовый ассистент. Всегда возвращай ответ в формате JSON." },
            { role: "user", content: `Проанализируй текст и извлеки сумму, категорию и тип транзакции. 
                Если текст содержит слова, связанные с доходами ("заработал", "получил", "перевели"), тип должен быть "income".
                Если текст содержит слова, связанные с расходами ("купил", "заплатил", "потратил"), тип должен быть "expense".
                Пример текста: "Мне перевели 5000 рублей за фриланс".
                Ответ в формате JSON: {"amount": 5000, "category": "Работа", "type": "income"}.
                Текст: "${text}"
            `}
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages,
            response_format: { type: "json_object" }
        });

        if (!response.choices[0].message.content) {
            throw new Error("Empty response from OpenAI API");
        }

        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error("Error analyzing text with ChatGPT API:", error);
        throw new Error("Failed to analyze spending text.");
    }
}