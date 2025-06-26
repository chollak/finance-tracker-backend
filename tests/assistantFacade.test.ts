import { AssistantFacade } from '../src/application/assistant/AssistantFacade';
import { OpenAIChatService } from '../src/infrastructure/openai/OpenAIChatService';
import { CreateTransactionUseCase } from '../src/application/transaction/CreateTransactionUseCase';

describe('AssistantFacade', () => {
  const chat: OpenAIChatService = {
    parseTransaction: jest.fn().mockResolvedValue({})
  } as unknown as OpenAIChatService;

  const createUseCase: CreateTransactionUseCase = {
    execute: jest.fn()
  } as unknown as CreateTransactionUseCase;

  const balanceHandler = jest.fn().mockResolvedValue(undefined);
  const reportHandler = jest.fn().mockResolvedValue(undefined);

  const facade = new AssistantFacade(chat, createUseCase, balanceHandler, reportHandler);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes to create transaction by default', async () => {
    await facade.handle('buy coffee');

    expect(createUseCase.execute).toHaveBeenCalled();
    expect(balanceHandler).not.toHaveBeenCalled();
    expect(reportHandler).not.toHaveBeenCalled();
  });

  it('routes to get balance intent', async () => {
    await facade.handle('show balance');

    expect(balanceHandler).toHaveBeenCalled();
  });

  it('routes to generate report intent', async () => {
    await facade.handle('monthly report');

    expect(reportHandler).toHaveBeenCalled();
  });

  it('mapIntent identifies intents', () => {
    expect(facade.mapIntent('balance please')).toBe('getBalance');
    expect(facade.mapIntent('report for july')).toBe('generateReport');
    expect(facade.mapIntent('coffee')).toBe('createTransaction');
  });
});
