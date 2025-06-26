import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat';
import { TransactionDTO } from '../../core/dto/TransactionDTO';

export class OpenAIChatService {
    private readonly openai: OpenAI;
    private readonly tools: ChatCompletionTool[];

    constructor(apiKey: string, tools: ChatCompletionTool[]) {
        this.openai = new OpenAI({ apiKey });
        this.tools = tools;
    }

    async extractTransaction(prompt: string): Promise<TransactionDTO> {
        const messages: ChatCompletionMessageParam[] = [
            { role: 'user', content: prompt }
        ];

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            tools: this.tools,
        });

        const toolCall = response.choices[0]?.message.tool_calls?.[0];
        if (!toolCall) {
            throw new Error('No tool call returned');
        }

        return TransactionDTO.fromRaw(toolCall.function.arguments);
    }
}

