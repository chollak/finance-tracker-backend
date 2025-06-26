import { OpenAIChatService } from '../../infrastructure/openai/OpenAIChatService';
import { CreateTransactionUseCase } from '../transaction/CreateTransactionUseCase';

export type AssistantIntent =
  | 'createTransaction'
  | 'getBalance'
  | 'generateReport'
  | 'unknown';

export class AssistantFacade {
  constructor(
    private chatService: OpenAIChatService,
    private createUseCase: CreateTransactionUseCase,
    private balanceHandler: () => Promise<void>,
    private reportHandler: () => Promise<void>
  ) {}

  mapIntent(message: string): AssistantIntent {
    const text = message.toLowerCase();
    if (text.includes('balance') || text.includes('баланс')) {
      return 'getBalance';
    }
    if (text.includes('report') || text.includes('отчет')) {
      return 'generateReport';
    }
    if (text.trim().length > 0) {
      return 'createTransaction';
    }
    return 'unknown';
  }

  async handle(message: string): Promise<void> {
    const intent = this.mapIntent(message);
    switch (intent) {
      case 'createTransaction': {
        const data = await this.chatService.parseTransaction(message);
        await this.createUseCase.execute(data);
        break;
      }
      case 'getBalance':
        await this.balanceHandler();
        break;
      case 'generateReport':
        await this.reportHandler();
        break;
    }
  }
}
