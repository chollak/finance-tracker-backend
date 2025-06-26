import { OPENAI_API_KEY } from '../config';
import { OpenAIChatService } from '../infrastructure/openai/OpenAIChatService';
import { ChatCompletionTool } from 'openai/resources/chat';
import { transactionSchema } from '../core/dto/TransactionDTO';

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: { name: 'createTransaction', parameters: transactionSchema }
  }
];

export function createOpenAIChatService(): OpenAIChatService {
  return new OpenAIChatService(OPENAI_API_KEY, tools);
}
